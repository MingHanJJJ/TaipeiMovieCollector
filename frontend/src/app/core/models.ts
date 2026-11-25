// Mirrors api/app/models.py. Change both together.

export type FormatKind = 'standard' | 'imax' | '4dx' | 'live' | 'premium';

export interface Cinema {
  code: string;
  short: string;
}

export interface Block {
  id: number;
  startMin: number; // minutes since 00:00 of the selected date (may be >= 1440)
  endMin: number;
  time: string;
  format: string;
  kind: FormatKind;
  tag: string;
  language: string | null;
  lane: number;
  href: string | null;
}

export interface CinemaRow {
  cinemaCode: string;
  cinemaName: string;
  cinemaShort: string;
  lanes: number;
  blocks: Block[];
}

export interface MovieGroup {
  movieId: number;
  titleZh: string;
  titleEn: string | null;
  runtimeMin: number | null;
  ratingClass: string | null;
  posterUrl: string | null;
  sessionCount: number;
  rows: CinemaRow[];
}

export interface Axis {
  startMin: number;
  endMin: number;
}

export interface ScreeningsResponse {
  cinemas: Cinema[];
  selected: string[];
  date: string;
  dates: string[];
  today: string;
  q: string;
  sessionCount: number;
  nowMin: number | null;
  axis: Axis;
  groups: MovieGroup[];
  syncedAt: string | null;
}
