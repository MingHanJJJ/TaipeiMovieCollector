DROP INDEX "movies_tmdb_id_uq";--> statement-breakpoint
DROP INDEX "movies_imdb_id_uq";--> statement-breakpoint
CREATE INDEX "movies_tmdb_id_idx" ON "movies" USING btree ("tmdb_id");--> statement-breakpoint
CREATE INDEX "movies_imdb_id_idx" ON "movies" USING btree ("imdb_id");