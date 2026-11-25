"""Shapes of the JSON the API returns (similar to TypeScript interfaces).

Fields are snake_case in Python and camelCase in JSON.
"""

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, validate_by_name=True, validate_by_alias=True)


class Cinema(ApiModel):
    code: str
    short: str


class Block(ApiModel):
    """One screening on the timeline."""

    id: int
    start_min: int  # minutes since 00:00 of the selected date (may be >= 1440)
    end_min: int
    time: str  # "13:30"
    format: str
    kind: str  # colour family: imax | 4dx | live | premium | standard
    tag: str  # short label shown after the time
    language: str | None
    lane: int
    href: str | None


class CinemaRow(ApiModel):
    cinema_code: str
    cinema_name: str
    cinema_short: str
    lanes: int
    blocks: list[Block]


class MovieGroup(ApiModel):
    movie_id: int
    title_zh: str
    title_en: str | None
    runtime_min: int | None
    rating_class: str | None
    poster_url: str | None
    session_count: int
    rows: list[CinemaRow]


class Axis(ApiModel):
    start_min: int
    end_min: int


class ScreeningsResponse(ApiModel):
    cinemas: list[Cinema]
    selected: list[str]
    date: str
    dates: list[str]
    today: str
    q: str
    session_count: int
    now_min: int | None
    axis: Axis
    groups: list[MovieGroup]
    synced_at: str | None
