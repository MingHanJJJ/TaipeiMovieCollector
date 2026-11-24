import { and, asc, gte, inArray, lt, sql } from "drizzle-orm";
import { db } from "../db/client";
import { cinemas, movies, screenings } from "../db/schema";
import { dayWindow, taipeiToday, type DayScreening } from "./timeline";

export async function listCinemas() {
  return db.select().from(cinemas).orderBy(asc(cinemas.id));
}

/** Screenings of one cinema day (06:00 → 06:00 Asia/Taipei) for the given cinema codes. */
export async function getDayScreenings(date: string, cinemaCodes: string[]): Promise<DayScreening[]> {
  if (cinemaCodes.length === 0) return [];
  const { start, end } = dayWindow(date);
  const rows = await db
    .select({
      id: screenings.id,
      movieId: movies.id,
      titleZh: movies.titleZh,
      titleEn: movies.titleEn,
      runtimeMin: movies.runtimeMin,
      ratingClass: movies.ratingClass,
      posterUrl: movies.posterUrl,
      tmdbId: movies.tmdbId,
      cinemaCode: cinemas.code,
      cinemaName: cinemas.name,
      provider: cinemas.provider,
      providerCinemaId: cinemas.providerCinemaId,
      providerMovieId: screenings.providerMovieId,
      format: screenings.format,
      language: screenings.language,
      startsAt: screenings.startsAt,
      endsAt: screenings.endsAt,
    })
    .from(screenings)
    .innerJoin(movies, sql`${movies.id} = ${screenings.movieId}`)
    .innerJoin(cinemas, sql`${cinemas.id} = ${screenings.cinemaId}`)
    .where(and(gte(screenings.startsAt, start), lt(screenings.startsAt, end), inArray(cinemas.code, cinemaCodes)))
    .orderBy(asc(screenings.startsAt));
  return rows;
}

/** Cinema-days (YYYY-MM-DD, Asia/Taipei) that have screenings, from today onward. */
export async function listAvailableDates(limit = 14): Promise<string[]> {
  const today = taipeiToday();
  const rows = await db.execute<{ d: string }>(sql`
    select distinct to_char((starts_at at time zone 'Asia/Taipei') - interval '6 hours', 'YYYY-MM-DD') as d
    from screenings
    order by d`);
  return rows.rows.map((r) => r.d).filter((d) => d >= today).slice(0, limit);
}

/** When the last successful sync finished (any Vieshow cinema). */
export async function lastSyncAt(): Promise<Date | null> {
  const r = await db.execute<{ t: Date | null }>(sql`select max(finished_at) as t from sync_runs where status = 'ok'`);
  const t = r.rows[0]?.t;
  return t ? new Date(t) : null;
}
