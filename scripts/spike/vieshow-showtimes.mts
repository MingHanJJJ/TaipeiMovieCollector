// Phase 0 spike (read-only): load Vieshow ShowTimes page, save the TP showtimes HTML + network log.
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = process.argv[2];
if (!OUT) throw new Error("usage: tsx vieshow-showtimes.ts <outDir>");
mkdirSync(OUT, { recursive: true });
chromium.use(stealth());

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const log: string[] = [];
page.on("response", (r) => log.push(`${r.status()} ${r.request().method()} ${r.url()}`));

const resp = await page.goto("https://www.vscinemas.com.tw/ShowTimes/", { timeout: 45000 });
console.log("page status", resp?.status(), "title:", await page.title());
await page.waitForTimeout(3000);

const html = await page.evaluate(async () => {
  const r = await fetch("/ShowTimes/ShowTimes/GetShowTimes", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "CinemaCode=TP",
  });
  return `${r.status}\n` + (await r.text());
});
writeFileSync(join(OUT, "tp-showtimes.html"), html);
writeFileSync(join(OUT, "network.log"), log.join("\n"));
console.log("saved; html bytes:", html.length, "requests:", log.length);
await browser.close();
