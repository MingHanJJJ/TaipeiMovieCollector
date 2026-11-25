"""Read-only database queries.

The tables are created and filled by the TypeScript code in backend/collector/.
"""

import os
from datetime import datetime
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import class_row, dict_row

from .timeline import DayScreening, day_window

# Use the project's .env when running outside Docker. Existing environment variables win.
load_dotenv(Path(__file__).resolve().parents[2] / ".env")


def connect() -> psycopg.Connection:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (copy .env.example to .env)")
    conn = psycopg.connect(url)
    conn.read_only = True
    return conn


def list_cinemas(conn: psycopg.Connection) -> list[dict]:
    with conn.cursor(row_factory=dict_row) as cur:
        return cur.execute("select code, name from cinemas order by id").fetchall()


def get_day_screenings(conn: psycopg.Connection, day: str, cinema_codes: list[str]) -> list[DayScreening]:
    """Screenings of one cinema day (06:00 -> 06:00 Asia/Taipei) for the given cinema codes."""
    if not cinema_codes:
        return []
    start, end = day_window(day)
    with conn.cursor(row_factory=class_row(DayScreening)) as cur:
        # %s placeholders keep user input separate from the SQL text (prevents SQL injection).
        return cur.execute(
            """
            select s.id, m.id as movie_id, m.title_zh, m.title_en, m.runtime_min, m.rating_class,
                   m.poster_url, m.tmdb_id, c.code as cinema_code, c.name as cinema_name, c.provider,
                   c.provider_cinema_id, s.provider_movie_id, s.format, s.language, s.starts_at, s.ends_at,
                   dense_rank() over (order by m.title_zh collate "zh-Hant-x-icu") as title_rank
            from screenings s
            join movies m on m.id = s.movie_id
            join cinemas c on c.id = s.cinema_id
            where s.starts_at >= %s and s.starts_at < %s and c.code = any(%s)
            order by s.starts_at
            """,
            (start, end, cinema_codes),
        ).fetchall()


def list_available_dates(conn: psycopg.Connection, today: str, limit: int = 14) -> list[str]:
    """Cinema days (YYYY-MM-DD, Asia/Taipei) that have screenings, from today onward."""
    rows = conn.execute(
        """
        select distinct to_char((starts_at at time zone 'Asia/Taipei') - interval '6 hours', 'YYYY-MM-DD') as d
        from screenings
        order by d
        """
    ).fetchall()
    return [d for (d,) in rows if d >= today][:limit]


def last_sync_at(conn: psycopg.Connection) -> datetime | None:
    """When the last successful sync finished (any Vieshow cinema)."""
    row = conn.execute("select max(finished_at) from sync_runs where status = 'ok'").fetchone()
    return row[0] if row else None
