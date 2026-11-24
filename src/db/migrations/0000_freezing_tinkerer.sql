CREATE TABLE "cinemas" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"code" text NOT NULL,
	"provider_cinema_id" text,
	"name" text NOT NULL,
	"region" text,
	CONSTRAINT "cinemas_provider_code_uq" UNIQUE("provider","code")
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" serial PRIMARY KEY NOT NULL,
	"title_zh" text NOT NULL,
	"title_en" text,
	"tmdb_id" integer,
	"imdb_id" text,
	"runtime_min" integer,
	"rating_class" text,
	"poster_url" text,
	"imdb_rating" numeric(3, 1),
	"imdb_votes" integer,
	"rt_critics_pct" smallint,
	"ratings_fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenings" (
	"id" serial PRIMARY KEY NOT NULL,
	"cinema_id" integer NOT NULL,
	"movie_id" integer NOT NULL,
	"provider_session_id" text,
	"provider_movie_id" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"format" text DEFAULT '' NOT NULL,
	"language" text,
	"sold_out" boolean DEFAULT false NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "screenings_cinema_session_uq" UNIQUE("cinema_id","provider_session_id"),
	CONSTRAINT "screenings_natural_uq" UNIQUE("cinema_id","movie_id","starts_at","format")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"cinema_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"screenings_upserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_cinema_id_cinemas_id_fk" FOREIGN KEY ("cinema_id") REFERENCES "public"."cinemas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "screenings" ADD CONSTRAINT "screenings_movie_id_movies_id_fk" FOREIGN KEY ("movie_id") REFERENCES "public"."movies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_cinema_id_cinemas_id_fk" FOREIGN KEY ("cinema_id") REFERENCES "public"."cinemas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "movies_title_zh_uq" ON "movies" USING btree ("title_zh");--> statement-breakpoint
CREATE UNIQUE INDEX "movies_tmdb_id_uq" ON "movies" USING btree ("tmdb_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movies_imdb_id_uq" ON "movies" USING btree ("imdb_id");--> statement-breakpoint
CREATE INDEX "screenings_starts_at_idx" ON "screenings" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "screenings_movie_starts_idx" ON "screenings" USING btree ("movie_id","starts_at");--> statement-breakpoint
CREATE INDEX "screenings_cinema_starts_idx" ON "screenings" USING btree ("cinema_id","starts_at");