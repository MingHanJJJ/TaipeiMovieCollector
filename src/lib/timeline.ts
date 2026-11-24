// Pure helpers that turn day screenings into per-movie timelines. No I/O.

/** A "cinema day" runs 06:00 → 06:00 (Asia/Taipei) so after-midnight shows stay with the evening before. */
export const DAY_START_HOUR = 6;
export const FALLBACK_DURATION_MIN = 135; // runtime unknown: 2h + trailers

export interface DayScreening {
  id: number;
  movieId: number;
  titleZh: string;
  titleEn: string | null;
  runtimeMin: number | null;
  ratingClass: string | null;
  posterUrl: string | null;
  tmdbId: number | null;
  cinemaCode: string;
  cinemaName: string;
  provider: string;
  providerCinemaId: string | null;
  providerMovieId: string | null;
  format: string;
  language: string | null;
  startsAt: Date;
  endsAt: Date | null;
}

export interface Block {
  id: number;
  startMin: number; // minutes since 00:00 of the selected date (may be >= 1440)
  endMin: number;
  time: string; // "13:30"
  format: string;
  language: string | null;
  lane: number;
  href: string | null;
}

export interface CinemaRow {
  cinemaCode: string;
  cinemaName: string;
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

export interface Axis { startMin: number; endMin: number }

const TAIPEI = "+08:00";

export function taipeiToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(now); // YYYY-MM-DD
}

export const isIsoDate = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

export function dayWindow(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T${String(DAY_START_HOUR).padStart(2, "0")}:00:00${TAIPEI}`);
  return { start, end: new Date(start.getTime() + 24 * 3600_000) };
}

export function minutesOfDay(at: Date, date: string): number {
  return Math.round((at.getTime() - new Date(`${date}T00:00:00${TAIPEI}`).getTime()) / 60_000);
}

export function formatClock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "台北信義威秀影城" -> "信義", "MUVIE CINEMAS 台北松仁" -> "MUVIE 松仁" */
export function shortCinemaName(name: string): string {
  return name
    .replace(/MUVIE CINEMAS\s*/i, "MUVIE ")
    .replace(/威秀影城/g, "")
    .replace(/台北(?!\s*$)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function bookingHref(s: Pick<DayScreening, "provider" | "providerCinemaId" | "cinemaCode" | "providerMovieId">): string | null {
  if (s.provider !== "vieshow" || !s.providerCinemaId || !s.providerMovieId) return null;
  // The movie's session list on Vieshow's booking site; the visitor picks the time there.
  return `https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx?cinema=${s.providerCinemaId}|${s.cinemaCode}&movie=${s.providerMovieId}`;
}

/** Overlapping sessions in one cinema row (different halls) go to separate lanes. */
export function packLanes<T extends { startMin: number; endMin: number; lane: number }>(blocks: T[]): number {
  const laneEnds: number[] = [];
  for (const b of [...blocks].sort((a, c) => a.startMin - c.startMin)) {
    let lane = laneEnds.findIndex((end) => end <= b.startMin);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(b.endMin); } else laneEnds[lane] = b.endMin;
    b.lane = lane;
  }
  return Math.max(laneEnds.length, 1);
}

/**
 * Display priority of a format: 0 = IMAX / premium halls (IMAX, TITAN, 4DX, GC, MUCROWN),
 * 1 = other special screenings (VR, live broadcasts, light-stick screenings, "IV" …), 2 = plain digital / 3D.
 */
export function formatTier(format: string): 0 | 1 | 2 {
  const f = format.trim();
  if (/IMAX|TITAN|4DX|\bGC\b|GOLD|MUCROWN/i.test(f)) return 0;
  if (f === "" || /^(數位|3D 數位|3D)/.test(f)) return 2;
  return 1;
}

/** Row-ordering rank of a format: 0 = IMAX, 1 = other premium halls, 2 = other special screenings, 3 = plain. */
export function formatRank(format: string): 0 | 1 | 2 | 3 {
  if (/IMAX/i.test(format)) return 0;
  const tier = formatTier(format);
  return tier === 0 ? 1 : tier === 1 ? 2 : 3;
}

/** Like packLanes, but premium sessions get the top lanes, then special ones, then plain ones. */
export function packLanesByTier<T extends { startMin: number; endMin: number; lane: number; format: string }>(blocks: T[]): number {
  let offset = 0;
  for (const tier of [0, 1, 2] as const) {
    const group = blocks.filter((b) => formatTier(b.format) === tier);
    if (group.length === 0) continue;
    const n = packLanes(group);
    for (const b of group) b.lane += offset;
    offset += n;
  }
  return Math.max(offset, 1);
}

/** Group by movie; rows: IMAX / premium cinemas first, then `cinemaOrder`; movies sorted by number of sessions (desc), then title. */
export function groupByMovie(screenings: DayScreening[], date: string, cinemaOrder: string[]): MovieGroup[] {
  // One card per film: titles that resolve to the same TMDB id are merged.
  const byMovie = new Map<string, DayScreening[]>();
  for (const s of screenings) {
    const key = s.tmdbId ? `t${s.tmdbId}` : `m${s.movieId}`;
    (byMovie.get(key) ?? byMovie.set(key, []).get(key)!).push(s);
  }

  const groups: MovieGroup[] = [];
  for (const list of byMovie.values()) {
    const first = list[0];
    const byCinema = new Map<string, DayScreening[]>();
    for (const s of list) (byCinema.get(s.cinemaCode) ?? byCinema.set(s.cinemaCode, []).get(s.cinemaCode)!).push(s);

    const rows: CinemaRow[] = [...byCinema.entries()].map(([code, items]) => {
      const blocks: Block[] = items.map((s) => {
        const startMin = minutesOfDay(s.startsAt, date);
        const endMin = s.endsAt ? minutesOfDay(s.endsAt, date) : startMin + (s.runtimeMin ? s.runtimeMin + 15 : FALLBACK_DURATION_MIN);
        return { id: s.id, startMin, endMin, time: formatClock(startMin), format: s.format, language: s.language, lane: 0, href: bookingHref(s) };
      });
      const lanes = packLanesByTier(blocks);
      blocks.sort((a, b) => a.startMin - b.startMin);
      return { cinemaCode: code, cinemaName: items[0].cinemaName, lanes, blocks };
    });
    // Cinemas showing this film in IMAX / premium halls come first; ties keep the configured cinema order.
    const rank = (r: CinemaRow) => Math.min(...r.blocks.map((b) => formatRank(b.format)));
    rows.sort((a, b) => rank(a) - rank(b) || cinemaOrder.indexOf(a.cinemaCode) - cinemaOrder.indexOf(b.cinemaCode));

    groups.push({
      movieId: first.movieId, titleZh: first.titleZh, titleEn: first.titleEn, runtimeMin: first.runtimeMin,
      ratingClass: first.ratingClass, posterUrl: first.posterUrl, sessionCount: list.length, rows,
    });
  }
  return groups.sort((a, b) => b.sessionCount - a.sessionCount || a.titleZh.localeCompare(b.titleZh, "zh-Hant"));
}

/** Shared hour-aligned axis covering every block (at least 6 h wide). */
export function axisFor(groups: MovieGroup[]): Axis {
  let min = Infinity, max = -Infinity;
  for (const g of groups) for (const r of g.rows) for (const b of r.blocks) { min = Math.min(min, b.startMin); max = Math.max(max, b.endMin); }
  if (!Number.isFinite(min)) return { startMin: 10 * 60, endMin: 24 * 60 };
  const startMin = Math.floor(min / 60) * 60;
  let endMin = Math.ceil(max / 60) * 60;
  if (endMin - startMin < 360) endMin = startMin + 360;
  return { startMin, endMin };
}

/** Colour family per format, used for blocks and the legend. */
export type FormatKind = "imax" | "4dx" | "live" | "premium" | "standard";
export function formatKind(format: string): FormatKind {
  const f = format.toUpperCase();
  if (f.includes("IMAX")) return "imax";
  if (f.includes("4DX")) return "4dx";
  if (f.includes("LIVE") || f.includes("PRE") || f.includes("應援")) return "live";
  if (/TITAN|MUCROWN|\bGC\b|GOLD/.test(f)) return "premium";
  return "standard";
}
