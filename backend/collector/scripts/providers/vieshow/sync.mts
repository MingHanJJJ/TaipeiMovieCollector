// Sync Vieshow showtimes into Postgres.
//   tsx scripts/providers/vieshow/sync.mts --cinema TP [--limit 3]
//   tsx scripts/providers/vieshow/sync.mts --all            (every seeded Vieshow cinema, one browser session)
// Polite by design: one headless session, 2–5 s random gap between pages. A blocked response aborts the whole run.
import "../../../src/env";
import { and, asc, eq, gt, lt } from "drizzle-orm";
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { db } from "../../../src/db/client";
import { cinemas, movies, screenings, syncRuns, type Cinema } from "../../../src/db/schema";
import { parseMovieList } from "../../../src/lib/vieshow/parse-movie-list";
import { parseSessionsPage } from "../../../src/lib/vieshow/parse-sessions";

const BASE = "https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx";
const ADS_MIN = 15; // trailers/ads before the film
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i > -1 ? process.argv[i + 1] : undefined; };
const all = process.argv.includes("--all");
const limit = arg("limit") ? Number(arg("limit")) : undefined;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => sleep(2000 + Math.random() * 3000);

class BlockedError extends Error {}

chromium.use(stealth());
const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 900 } })).newPage();

async function get(url: string): Promise<string> {
  const resp = await page.goto(url, { timeout: 45_000, waitUntil: "domcontentloaded" });
  const html = await page.content();
  const status = resp?.status() ?? 0;
  if (status === 403 || status === 429 || /Access Denied/i.test(html.slice(0, 2000)) || page.url().includes("/hold/")) {
    throw new BlockedError(`blocked: ${status} ${page.url()}`);
  }
  return html;
}

async function syncCinema(cinema: Cinema): Promise<{ upserted: number; withdrawn: number }> {
  const [run] = await db.insert(syncRuns).values({ provider: "vieshow", cinemaId: cinema.id }).returning();
  const runStart = new Date();
  let upserted = 0;
  try {
    const q = `${BASE}?cinema=${cinema.providerCinemaId}|${cinema.code}`;
    const list = parseMovieList(await get(q));
    const todo = limit ? list.slice(0, limit) : list;
    console.log(`${cinema.code} ${cinema.name}: ${list.length} movie versions, fetching ${todo.length}`);

    for (const [i, item] of todo.entries()) {
      await jitter();
      const p = parseSessionsPage(await get(`${q}&movie=${item.providerMovieId}`));
      const [movie] = await db.insert(movies).values({
        titleZh: p.title, titleEn: p.titleEn, runtimeMin: p.runtimeMin, ratingClass: p.ratingClass,
      }).onConflictDoUpdate({
        target: movies.titleZh,
        set: { titleEn: p.titleEn, runtimeMin: p.runtimeMin, ratingClass: p.ratingClass },
      }).returning();

      for (const s of p.sessions) {
        const endsAt = p.runtimeMin ? new Date(s.startsAt.getTime() + (p.runtimeMin + ADS_MIN) * 60_000) : null;
        await db.insert(screenings).values({
          cinemaId: cinema.id, movieId: movie.id, providerSessionId: s.sessionId, providerMovieId: item.providerMovieId,
          startsAt: s.startsAt, endsAt, format: p.format, language: p.language, lastSeenAt: new Date(),
        }).onConflictDoUpdate({
          target: [screenings.cinemaId, screenings.providerSessionId],
          set: { movieId: movie.id, startsAt: s.startsAt, endsAt, format: p.format, language: p.language, lastSeenAt: new Date() },
        });
        upserted++;
      }
      console.log(`  [${i + 1}/${todo.length}] ${p.raw} → ${p.sessions.length} sessions`);
    }

    // Only a complete run may withdraw screenings that vanished from the site.
    let withdrawn = 0;
    if (!limit) {
      const gone = await db.delete(screenings)
        .where(and(eq(screenings.cinemaId, cinema.id), gt(screenings.startsAt, runStart), lt(screenings.lastSeenAt, runStart)))
        .returning({ id: screenings.id });
      withdrawn = gone.length;
    }
    await db.update(syncRuns).set({ status: "ok", finishedAt: new Date(), screeningsUpserted: upserted }).where(eq(syncRuns.id, run.id));
    console.log(`${cinema.code} done: ${upserted} screenings upserted, ${withdrawn} withdrawn`);
    return { upserted, withdrawn };
  } catch (e) {
    const blocked = e instanceof BlockedError;
    await db.update(syncRuns).set({ status: blocked ? "blocked" : "error", finishedAt: new Date(), screeningsUpserted: upserted, error: String(e).slice(0, 500) }).where(eq(syncRuns.id, run.id));
    throw e;
  }
}

try {
  const where = all
    ? eq(cinemas.provider, "vieshow")
    : and(eq(cinemas.provider, "vieshow"), eq(cinemas.code, (arg("cinema") ?? "TP").toUpperCase()));
  const targets = await db.select().from(cinemas).where(where).orderBy(asc(cinemas.id));
  if (targets.length === 0) throw new Error("no matching cinema (run npm run seed)");

  const failed: string[] = [];
  for (const [i, c] of targets.entries()) {
    if (i > 0) await sleep(5000 + Math.random() * 5000);
    try {
      await syncCinema(c);
    } catch (e) {
      if (e instanceof BlockedError) throw e; // a block stops everything
      console.error(`${c.code} failed:`, e);
      failed.push(c.code); // a parse/db error only skips this cinema
    }
  }
  if (failed.length) { console.error(`failed cinemas: ${failed.join(", ")}`); process.exitCode = 1; }
} catch (e) {
  console.error(e instanceof BlockedError ? `STOPPED (not retrying): ${e.message}` : e);
  process.exitCode = 1;
} finally {
  await browser.close();
  process.exit(process.exitCode ?? 0);
}
