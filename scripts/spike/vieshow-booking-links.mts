// Phase 0 spike (read-only): find where Vieshow's booking flow lives. Does not submit anything.
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
chromium.use(stealth());
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
for (const url of ["https://www.vscinemas.com.tw/vsweb/", "https://www.vscinemas.com.tw/ShowTimes/"]) {
  const r = await page.goto(url, { timeout: 45000 });
  await page.waitForTimeout(2500);
  const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map(a => `${(a.textContent||"").trim().slice(0,30)} -> ${(a as HTMLAnchorElement).href}`));
  const scripts = await page.evaluate(() => [...document.scripts].map(s => s.src).filter(Boolean));
  const ticketish = (await page.content()).match(/[^"'\s]*(ticket|booking|order|seat)[^"'\s]*/gi) ?? [];
  console.log("==", url, r?.status(), "links:", links.length);
  console.log(links.filter(l => /ticket|booking|order|訂票|購票|seat/i.test(l)).join("\n"));
  console.log("scripts:", scripts.filter(s => s.includes("vscinemas")).join("\n"));
  console.log("ticketish:", [...new Set(ticketish)].slice(0, 15).join(" | "));
  writeFileSync(join(OUT, new URL(url).pathname.replace(/\W/g, "_") + ".html"), await page.content());
}
await browser.close();
