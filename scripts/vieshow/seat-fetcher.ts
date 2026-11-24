// Fetches ONE Vieshow SessionSeats page at a time, politely.
//  - single persistent headed browser session (profile in .state/vieshow-profile)
//  - random 20–60 s gap between requests, enforced across process restarts
//  - circuit breaker: any 403/429 or "Access Denied" page => stop for 24 h. No retry/proxy/rotation/fingerprint tweaks.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CircuitBreaker, CircuitOpenError, isBlockedStatus } from "../../src/lib/vieshow/circuit-breaker";
import { parseSeatMap, type ParsedSeatMap } from "../../src/lib/vieshow/seat-parser";

const PROFILE_DIR = ".state/vieshow-profile";
const LAST_REQ_FILE = ".state/vieshow-last-request.txt";
export const MIN_GAP_MS = 20_000;
export const MAX_GAP_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);

function msSinceLastRequest(): number {
  try { return Date.now() - Number(readFileSync(LAST_REQ_FILE, "utf8")); } catch { return Infinity; }
}

export class SeatFetcher {
  private ctx?: Awaited<ReturnType<typeof chromium.launchPersistentContext>>;
  constructor(private breaker = new CircuitBreaker()) {}

  private async context() {
    if (!this.ctx) {
      mkdirSync(PROFILE_DIR, { recursive: true });
      // Plain headed Chromium with default settings: no stealth plugin, no UA/fingerprint overrides.
      this.ctx = await chromium.launchPersistentContext(PROFILE_DIR, { headless: false, locale: "zh-TW", viewport: { width: 1100, height: 900 } });
    }
    return this.ctx;
  }

  async fetchSeatMap(cinemaId: string | number, sessionId: string | number): Promise<ParsedSeatMap> {
    this.breaker.assertClosed();
    const wait = Math.max(0, rand(MIN_GAP_MS, MAX_GAP_MS) - msSinceLastRequest());
    if (wait > 0) await sleep(wait);
    this.breaker.assertClosed(); // re-check after waiting

    const ctx = await this.context();
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    mkdirSync(".state", { recursive: true });
    writeFileSync(LAST_REQ_FILE, String(Date.now()));
    const url = `https://sales.vscinemas.com.tw/VoucherTicketing/SessionSeats.aspx?CinemaCode=${cinemaId}&txtSessionId=${sessionId}`;
    const resp = await page.goto(url, { timeout: 45_000, waitUntil: "domcontentloaded" });
    const html = await page.content();
    const status = resp?.status() ?? 0;
    if (isBlockedStatus(status) || /Access Denied/i.test(html.slice(0, 2000)) || page.url().includes("/hold/")) {
      this.breaker.trip(`blocked: status=${status} url=${page.url()}`);
      throw new CircuitOpenError(new Date(Date.now() + 24 * 3600e3), `blocked (${status})`);
    }
    return parseSeatMap(html);
  }

  async close() { await this.ctx?.close(); }
}
