from datetime import datetime

import pytest

from app.models import Block
from app.timeline import (
    DayScreening, axis_for, booking_href, day_window, format_clock, format_kind, format_rank, format_tier,
    group_by_movie, is_iso_date, minutes_of_day, pack_lanes, short_cinema_name,
)

DAY = "2026-11-26"


def at(iso: str) -> datetime:
    return datetime.fromisoformat(iso)


def screening(id: int, cinema: str, iso: str, **extra) -> DayScreening:
    values = dict(
        id=id, movie_id=1, title_zh="片A", title_en=None, runtime_min=100, rating_class=None, poster_url=None,
        tmdb_id=None, cinema_code=cinema, cinema_name=cinema, provider="vieshow", provider_cinema_id="1",
        provider_movie_id="HO1", format="數位", language="英", starts_at=at(iso), ends_at=None,
    )
    return DayScreening(**(values | extra))


def test_time_helpers():
    assert minutes_of_day(at("2026-11-26T02:35:00Z"), DAY) == 10 * 60 + 35
    assert minutes_of_day(at("2026-11-26T17:10:00Z"), DAY) == 25 * 60 + 10
    assert format_clock(25 * 60 + 10) == "01:10"
    start, end = day_window(DAY)
    assert start == at("2026-11-25T22:00:00Z")
    assert (end - start).total_seconds() == 24 * 3600


@pytest.mark.parametrize("value,expected", [(DAY, True), ("2026-13-40", False), ("hello", False), (None, False)])
def test_is_iso_date(value, expected):
    assert is_iso_date(value) is expected


def test_short_cinema_name():
    assert short_cinema_name("台北信義威秀影城") == "信義"
    assert short_cinema_name("MUVIE CINEMAS 台北松仁") == "MUVIE 松仁"
    assert short_cinema_name("板橋大遠百威秀影城") == "板橋大遠百"


@pytest.mark.parametrize("fmt,tier", [
    ("IMAX 3D", 0), ("IV TITAN", 0), ("GC", 0), ("VR", 1), ("光感應援場", 1), ("IV 3D", 1),
    ("數位", 2), ("3D 數位", 2), ("數位 印地語", 2), ("", 2),
])
def test_format_tier(fmt, tier):
    assert format_tier(fmt) == tier


def test_format_rank_and_kind():
    assert [format_rank(f) for f in ("IMAX", "4DX", "VR", "數位")] == [0, 1, 2, 3]
    assert [format_kind(f) for f in ("IMAX 3D", "IV 4DX 3D", "LIVE", "數位", "TITAN")] == ["imax", "4dx", "live", "standard", "premium"]


def test_booking_href():
    assert booking_href("vieshow", "1", "TP", "HO1").endswith("ticket.aspx?cinema=1|TP&movie=HO1")
    assert booking_href("miramar", None, "MR", None) is None


def test_group_by_movie():
    rows = [
        screening(1, "QS", "2026-11-26T06:00:00Z"),
        screening(2, "TP", "2026-11-26T02:35:00Z"),
        screening(3, "TP", "2026-11-26T10:00:00Z"),
        screening(4, "TP", "2026-11-26T03:00:00Z", movie_id=2, title_zh="片B"),
    ]
    groups = group_by_movie(rows, DAY, ["TP", "QS"])
    assert [g.title_zh for g in groups] == ["片A", "片B"]
    assert [r.cinema_code for r in groups[0].rows] == ["TP", "QS"]
    first = groups[0].rows[0].blocks[0]
    assert (first.time, first.end_min - first.start_min) == ("10:35", 115)


def test_premium_rows_and_lanes_come_first():
    rows = [
        screening(1, "TP", "2026-11-26T02:00:00Z"),
        screening(2, "BQ", "2026-11-26T02:00:00Z"),
        screening(3, "BQ", "2026-11-26T08:00:00Z", format="IMAX"),
    ]
    result = group_by_movie(rows, DAY, ["TP", "BQ"])[0].rows
    assert [r.cinema_code for r in result] == ["BQ", "TP"]
    assert {b.format: b.lane for b in result[0].blocks} == {"IMAX": 0, "數位": 1}


def test_same_tmdb_id_is_one_card():
    rows = [
        screening(1, "TP", "2026-11-26T02:00:00Z", movie_id=10, tmdb_id=99),
        screening(2, "QS", "2026-11-26T06:00:00Z", movie_id=11, tmdb_id=99),
    ]
    assert len(group_by_movie(rows, DAY, ["TP", "QS"])) == 1


def test_empty_axis():
    axis = axis_for([])
    assert (axis.start_min, axis.end_min) == (600, 1440)


def block(start: int, end: int) -> Block:
    return Block(id=start, start_min=start, end_min=end, time="", format="", kind="standard", tag="",
                 language=None, lane=0, href=None)


def test_pack_lanes_stacks_overlaps_and_reuses_free_lanes():
    blocks = [block(600, 710), block(620, 730), block(720, 800)]
    assert pack_lanes(blocks) == 2
    assert [b.lane for b in blocks] == [0, 1, 0]


def test_cinema_row_order():
    def row(i, cinema, fmt="數位", hour="02"):
        return screening(i, cinema, f"2026-11-26T{hour}:00:00Z", format=fmt)

    rows = [row(1, "TP", "4DX"), row(2, "QS"), row(3, "BQ"), row(4, "BQ", "IMAX", "08"), row(5, "HU", "IMAX", "03"), row(6, "MU")]
    result = group_by_movie(rows, DAY, ["TP", "MU", "QS", "BQ", "HU"])[0].rows
    assert [r.cinema_code for r in result] == ["BQ", "HU", "TP", "MU", "QS"]


def test_movies_sort_by_session_count_then_title_rank():
    rows = [
        screening(1, "TP", "2026-11-26T02:00:00Z", movie_id=1, title_zh="乙", title_rank=2),
        screening(2, "TP", "2026-11-26T03:00:00Z", movie_id=2, title_zh="甲", title_rank=1),
    ]
    assert [g.title_zh for g in group_by_movie(rows, DAY, ["TP"])] == ["甲", "乙"]
