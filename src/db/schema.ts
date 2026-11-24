import { relations } from "drizzle-orm";
import {
  boolean, index, integer, numeric, pgTable, serial, smallint, text, timestamp, unique, uniqueIndex,
} from "drizzle-orm/pg-core";

/** A physical cinema. `provider` + `code` is the natural key, e.g. ('vieshow','TP'). */
export const cinemas = pgTable("cinemas", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(), // 'vieshow' | 'miramar'
  code: text("code").notNull(), // 'TP'
  providerCinemaId: text("provider_cinema_id"), // vieshow: '1'
  name: text("name").notNull(),
  region: text("region"),
}, (t) => [unique("cinemas_provider_code_uq").on(t.provider, t.code)]);

/**
 * A film, de-duplicated across cinemas / formats.
 * Vieshow lists one entry per format ("(4DX 3D 英)片名"); the parser strips the prefix so `titleZh` is the bare title.
 */
export const movies = pgTable("movies", {
  id: serial("id").primaryKey(),
  titleZh: text("title_zh").notNull(),
  titleEn: text("title_en"),
  tmdbId: integer("tmdb_id"),
  imdbId: text("imdb_id"),
  runtimeMin: integer("runtime_min"),
  ratingClass: text("rating_class"), // 普遍級 / 保護級 …
  posterUrl: text("poster_url"),
  imdbRating: numeric("imdb_rating", { precision: 3, scale: 1 }), // 0.0–10.0
  imdbVotes: integer("imdb_votes"),
  rtCriticsPct: smallint("rt_critics_pct"), // 0–100; null = unknown (OMDb returns N/A sometimes)
  ratingsFetchedAt: timestamp("ratings_fetched_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("movies_title_zh_uq").on(t.titleZh),
  uniqueIndex("movies_tmdb_id_uq").on(t.tmdbId),
  uniqueIndex("movies_imdb_id_uq").on(t.imdbId),
]);

export const screenings = pgTable("screenings", {
  id: serial("id").primaryKey(),
  cinemaId: integer("cinema_id").notNull().references(() => cinemas.id, { onDelete: "cascade" }),
  movieId: integer("movie_id").notNull().references(() => movies.id, { onDelete: "cascade" }),
  providerSessionId: text("provider_session_id"), // vieshow txtSessionId
  providerMovieId: text("provider_movie_id"), // vieshow 'HO00018172' (one per format/language version)
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  format: text("format").notNull().default(""), // 'IMAX 3D' / '4DX' / '數位'
  language: text("language"), // '英' / '國'
  soldOut: boolean("sold_out").notNull().default(false),
  /** last sync that still saw this screening; older rows are treated as withdrawn */
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("screenings_cinema_session_uq").on(t.cinemaId, t.providerSessionId),
  unique("screenings_natural_uq").on(t.cinemaId, t.movieId, t.startsAt, t.format),
  index("screenings_starts_at_idx").on(t.startsAt),
  index("screenings_movie_starts_idx").on(t.movieId, t.startsAt),
  index("screenings_cinema_starts_idx").on(t.cinemaId, t.startsAt),
]);

export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  cinemaId: integer("cinema_id").references(() => cinemas.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"), // running | ok | error | blocked
  screeningsUpserted: integer("screenings_upserted").notNull().default(0),
  error: text("error"),
});

export const cinemasRelations = relations(cinemas, ({ many }) => ({ screenings: many(screenings) }));
export const moviesRelations = relations(movies, ({ many }) => ({ screenings: many(screenings) }));
export const screeningsRelations = relations(screenings, ({ one }) => ({
  cinema: one(cinemas, { fields: [screenings.cinemaId], references: [cinemas.id] }),
  movie: one(movies, { fields: [screenings.movieId], references: [movies.id] }),
}));

export type Cinema = typeof cinemas.$inferSelect;
export type Movie = typeof movies.$inferSelect;
export type Screening = typeof screenings.$inferSelect;
export type NewScreening = typeof screenings.$inferInsert;
