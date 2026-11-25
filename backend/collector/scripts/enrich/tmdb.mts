// Match our movies on TMDB: poster + tmdb_id + imdb_id.
//   tsx scripts/enrich/tmdb.mts [--retry]    (--retry also re-checks films that had no match before)
import "../../src/env";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first"); // WSL: IPv6 routes to api.themoviedb.org are flaky
import { readFileSync } from "node:fs";
import { eq, isNull, or, sql } from "drizzle-orm";
import { db } from "../../src/db/client";
import { movies } from "../../src/db/schema";
import { posterUrl, Tmdb } from "../../src/lib/tmdb";

const key = process.env.TMDB_API_KEY;
if (!key) {
  console.error("TMDB_API_KEY is empty. Get a free key at https://www.themoviedb.org/settings/api and put it in .env");
  process.exit(1);
}
const retry = process.argv.includes("--retry");
const tmdb = new Tmdb(key);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Manual overrides first: they win over (and repair) automatic matches.
const overrides = JSON.parse(readFileSync("scripts/seed/tmdb-overrides.json", "utf8")) as Record<string, number | null | string>;
const manual = new Set<string>();
for (const [title, id] of Object.entries(overrides)) {
  if (title.startsWith("_")) continue;
  const [row] = await db.select().from(movies).where(eq(movies.titleZh, title));
  if (!row) continue;
  manual.add(title);
  if (id === null) {
    await db.update(movies).set({ tmdbId: null, imdbId: null, posterUrl: null, tmdbCheckedAt: new Date() }).where(eq(movies.id, row.id));
    console.log(`  = ${title}: forced no match`);
  } else if (typeof id === "number" && row.tmdbId !== id) {
    const d = await tmdb.details(id).catch((e: Error) => { console.error(`  ✗ override ${title}: ${e.message}`); return null; });
    if (!d) continue;
    await db.update(movies).set({
      tmdbId: d.id, imdbId: d.imdb_id || null, posterUrl: d.poster_path ? posterUrl(d.poster_path) : null, tmdbCheckedAt: new Date(),
    }).where(eq(movies.id, row.id));
    console.log(`  = ${title}  →  ${d.title} (tmdb ${d.id}, manual override)`);
  }
}

// Films never checked (or, with --retry, also those checked but unmatched) and without a poster yet.
const todo = await db.select().from(movies).where(
  retry ? isNull(movies.tmdbId) : or(isNull(movies.tmdbCheckedAt), sql`${movies.tmdbCheckedAt} < now() - interval '14 days' and ${movies.tmdbId} is null`),
);
console.log(`${todo.length} films to look up`);

let matched = 0;
for (const m of todo) {
  if (manual.has(m.titleZh)) continue;
  try {
    const hit = await tmdb.match({ titleZh: m.titleZh, titleEn: m.titleEn });
    if (hit) {
      const imdb = await tmdb.imdbId(hit.id);
      await db.update(movies).set({
        tmdbId: hit.id, imdbId: imdb, posterUrl: hit.poster_path ? posterUrl(hit.poster_path) : null, tmdbCheckedAt: new Date(),
      }).where(eq(movies.id, m.id));
      matched++;
      console.log(`  ✓ ${m.titleZh}  →  ${hit.title} (tmdb ${hit.id}${imdb ? ", " + imdb : ""})${hit.poster_path ? "" : "  [no poster]"}`);
    } else {
      await db.update(movies).set({ tmdbCheckedAt: new Date() }).where(eq(movies.id, m.id));
      console.log(`  · ${m.titleZh}: no confident match`);
    }
  } catch (e) {
    console.error(`  ✗ ${m.titleZh}:`, (e as Error).message); // leave unchecked so it is retried next run
    if (/HTTP 401|HTTP 403/.test((e as Error).message)) { console.error("TMDB rejected the key; stopping."); break; }
  }
  await sleep(250);
}
console.log(`done: ${matched}/${todo.length} matched`);
process.exit(0);
