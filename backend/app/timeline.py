"""Pure helpers that turn one day's screenings into per-movie timelines. No I/O."""

import math
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone

from .models import Axis, Block, CinemaRow, MovieGroup

# A "cinema day" runs 06:00 -> 06:00 (Asia/Taipei) so after-midnight shows stay with the evening before.
DAY_START_HOUR = 6
FALLBACK_DURATION_MIN = 135  # runtime unknown: 2h + trailers
TAIPEI = timezone(timedelta(hours=8))


@dataclass
class DayScreening:
    id: int
    movie_id: int
    title_zh: str
    title_en: str | None
    runtime_min: int | None
    rating_class: str | None
    poster_url: str | None
    tmdb_id: int | None
    cinema_code: str
    cinema_name: str
    provider: str
    provider_cinema_id: str | None
    provider_movie_id: str | None
    format: str
    language: str | None
    starts_at: datetime
    ends_at: datetime | None
    title_rank: int = 0  # position of title_zh in Chinese sort order (computed by the database)


def taipei_today(now: datetime | None = None) -> str:
    return (now or datetime.now(TAIPEI)).astimezone(TAIPEI).date().isoformat()


def is_iso_date(s: str | None) -> bool:
    if not s or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s, re.ASCII):
        return False
    try:
        date.fromisoformat(s)
    except ValueError:
        return False
    return True


def _midnight(day: str) -> datetime:
    return datetime.fromisoformat(f"{day}T00:00:00+08:00")


def day_window(day: str) -> tuple[datetime, datetime]:
    start = _midnight(day) + timedelta(hours=DAY_START_HOUR)
    return start, start + timedelta(days=1)


def minutes_of_day(at: datetime, day: str) -> int:
    return math.floor((at - _midnight(day)).total_seconds() / 60 + 0.5)


def format_clock(minutes: int) -> str:
    hours, mins = divmod(minutes % 1440, 60)
    return f"{hours:02d}:{mins:02d}"


def short_cinema_name(name: str) -> str:
    """"台北信義威秀影城" -> "信義", "MUVIE CINEMAS 台北松仁" -> "MUVIE 松仁"."""
    name = re.sub(r"MUVIE CINEMAS\s*", "MUVIE ", name, flags=re.IGNORECASE)
    name = name.replace("威秀影城", "")
    name = re.sub(r"台北(?!\s*$)", "", name)
    return re.sub(r"\s+", " ", name).strip()


def booking_href(provider: str, provider_cinema_id: str | None, cinema_code: str, provider_movie_id: str | None) -> str | None:
    if provider != "vieshow" or not provider_cinema_id or not provider_movie_id:
        return None
    # The movie's session list on Vieshow's booking site; the visitor picks the time there.
    return (
        "https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx"
        f"?cinema={provider_cinema_id}|{cinema_code}&movie={provider_movie_id}"
    )


def pack_lanes(blocks: list) -> int:
    """Overlapping sessions in one cinema row (different halls) go to separate lanes."""
    lane_ends: list[int] = []
    for b in sorted(blocks, key=lambda x: x.start_min):
        lane = next((i for i, end in enumerate(lane_ends) if end <= b.start_min), None)
        if lane is None:
            lane = len(lane_ends)
            lane_ends.append(b.end_min)
        else:
            lane_ends[lane] = b.end_min
        b.lane = lane
    return max(len(lane_ends), 1)


def format_tier(fmt: str) -> int:
    """Display priority: 0 = IMAX / premium halls, 1 = other special screenings, 2 = plain digital / 3D."""
    f = fmt.strip()
    if re.search(r"IMAX|TITAN|4DX|\bGC\b|GOLD|MUCROWN", f, re.IGNORECASE | re.ASCII):
        return 0
    if f == "" or re.match(r"(數位|3D 數位|3D)", f):
        return 2
    return 1


def format_rank(fmt: str) -> int:
    """Row-ordering rank: 0 = IMAX, 1 = other premium halls, 2 = other special screenings, 3 = plain."""
    if re.search("IMAX", fmt, re.IGNORECASE):
        return 0
    return format_tier(fmt) + 1


def pack_lanes_by_tier(blocks: list) -> int:
    """Like pack_lanes, but premium sessions get the top lanes, then special ones, then plain ones."""
    offset = 0
    for tier in (0, 1, 2):
        group = [b for b in blocks if format_tier(b.format) == tier]
        if not group:
            continue
        count = pack_lanes(group)
        for b in group:
            b.lane += offset
        offset += count
    return max(offset, 1)


def format_kind(fmt: str) -> str:
    """Colour family per format, used for blocks and the legend."""
    f = fmt.upper()
    if "IMAX" in f:
        return "imax"
    if "4DX" in f:
        return "4dx"
    if "LIVE" in f or "PRE" in f or "應援" in f:
        return "live"
    if re.search(r"TITAN|MUCROWN|\bGC\b|GOLD", f, re.ASCII):
        return "premium"
    return "standard"


def _to_block(s: DayScreening, day: str) -> Block:
    start = minutes_of_day(s.starts_at, day)
    if s.ends_at:
        end = minutes_of_day(s.ends_at, day)
    else:
        end = start + (s.runtime_min + 15 if s.runtime_min else FALLBACK_DURATION_MIN)
    tag = "" if format_tier(s.format) == 2 else re.sub(r"\s*3D$", "", s.format, flags=re.IGNORECASE)
    return Block(
        id=s.id,
        start_min=start,
        end_min=end,
        time=format_clock(start),
        format=s.format,
        kind=format_kind(s.format),
        tag="·".join(part for part in (tag, s.language) if part),
        language=s.language,
        lane=0,
        href=booking_href(s.provider, s.provider_cinema_id, s.cinema_code, s.provider_movie_id),
    )


def group_by_movie(screenings: list[DayScreening], day: str, cinema_order: list[str]) -> list[MovieGroup]:
    """Group by movie.

    Rows: IMAX / premium cinemas first, then `cinema_order`.
    Movies: most sessions first, then by title.
    """
    # One card per film: titles that resolve to the same TMDB id are merged.
    by_movie: dict[str, list[DayScreening]] = {}
    for s in screenings:
        key = f"t{s.tmdb_id}" if s.tmdb_id else f"m{s.movie_id}"
        by_movie.setdefault(key, []).append(s)

    ranked: list[tuple[int, MovieGroup]] = []
    for items in by_movie.values():
        first = items[0]
        by_cinema: dict[str, list[DayScreening]] = {}
        for s in items:
            by_cinema.setdefault(s.cinema_code, []).append(s)

        rows = []
        for code, sessions in by_cinema.items():
            blocks = [_to_block(s, day) for s in sessions]
            lanes = pack_lanes_by_tier(blocks)
            blocks.sort(key=lambda b: b.start_min)
            name = sessions[0].cinema_name
            rows.append(CinemaRow(cinema_code=code, cinema_name=name, cinema_short=short_cinema_name(name), lanes=lanes, blocks=blocks))

        # Cinemas showing this film in IMAX / premium halls come first; ties keep the configured cinema order.
        rows.sort(key=lambda r: (min(format_rank(b.format) for b in r.blocks), cinema_order.index(r.cinema_code)))

        group = MovieGroup(
            movie_id=first.movie_id,
            title_zh=first.title_zh,
            title_en=first.title_en,
            runtime_min=first.runtime_min,
            rating_class=first.rating_class,
            poster_url=first.poster_url,
            session_count=len(items),
            rows=rows,
        )
        ranked.append((first.title_rank, group))

    ranked.sort(key=lambda pair: (-pair[1].session_count, pair[0]))
    return [group for _, group in ranked]


def axis_for(groups: list[MovieGroup]) -> Axis:
    """Shared hour-aligned axis covering every block (at least 6 h wide)."""
    blocks = [b for g in groups for r in g.rows for b in r.blocks]
    if not blocks:
        return Axis(start_min=10 * 60, end_min=24 * 60)
    start = min(b.start_min for b in blocks) // 60 * 60
    end = -(-max(b.end_min for b in blocks) // 60) * 60  # round up to the hour
    return Axis(start_min=start, end_min=max(end, start + 360))
