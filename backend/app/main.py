"""HTTP API used by the Angular frontend."""

from datetime import datetime, timezone

from fastapi import FastAPI, Query

from . import db
from .models import Cinema, ScreeningsResponse
from .timeline import axis_for, group_by_movie, is_iso_date, minutes_of_day, short_cinema_name, taipei_today

app = FastAPI(title="Taipei Movie Collector API")


@app.get("/api/screenings", response_model=ScreeningsResponse)
def get_screenings(
    date: str | None = None,
    c: str | None = Query(None, description="Comma-separated cinema codes. Omit for all cinemas."),
    q: str = Query("", description="Search in Chinese or English titles."),
):
    today = taipei_today()
    with db.connect() as conn:
        cinemas = db.list_cinemas(conn)
        dates = db.list_available_dates(conn, today)
        synced = db.last_sync_at(conn)

        if is_iso_date(date):
            day = date
        elif today in dates or not dates:
            day = today
        else:
            day = dates[0]

        all_codes = [x["code"] for x in cinemas]
        selected = all_codes if c is None else [code for code in c.split(",") if code in all_codes]
        rows = db.get_day_screenings(conn, day, selected)

    q = q.strip()
    needle = q.lower()
    if needle:
        rows = [r for r in rows if needle in r.title_zh.lower() or needle in (r.title_en or "").lower()]
    groups = group_by_movie(rows, day, all_codes)

    return ScreeningsResponse(
        cinemas=[Cinema(code=x["code"], short=short_cinema_name(x["name"])) for x in cinemas],
        selected=selected,
        date=day,
        dates=dates if day in dates else sorted([day, *dates]),
        today=today,
        q=q,
        session_count=len(rows),
        now_min=minutes_of_day(datetime.now(timezone.utc), day) if day == today else None,
        axis=axis_for(groups),
        groups=groups,
        synced_at=synced.isoformat() if synced else None,
    )
