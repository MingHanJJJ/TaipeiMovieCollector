// Phase 0 spike (read-only): open TP booking list, click one movie, dump the sessions markup. No ticket selection.
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
chromium.use(stealth());
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const log: string[] = [];
page.on("response", (r) => {
  const t = r.request().resourceType();
  if (["document", "xhr", "fetch"].includes(t) && !/google|mpulse|analytics/.test(r.url())) log.push(`${r.status()} ${r.request().method()} ${t} ${r.url()}`);
});
await page.goto("https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx?cinema=1|TP", { timeout: 45000 });
await page.waitForTimeout(3000);
const movies = await page.$$eval("a", (as) => as.filter((a) => /歡迎光臨魔法秘境/.test(a.textContent || "")).map((a) => `${a.textContent?.trim()} | href=${a.getAttribute("href")} | onclick=${a.getAttribute("onclick")} | id=${a.id}`));
console.log("movie anchors:", movies.join("\n"));
const link = page.locator("a", { hasText: "(數位 英)歡迎光臨魔法秘境" }).first();
await link.click();
await page.waitForTimeout(5000);
console.log("url:", page.url());
writeFileSync(join(OUT, "sessions.html"), await page.content());
await page.screenshot({ path: join(OUT, "sessions.png"), fullPage: true });
console.log(log.join("\n"));
await browser.close();
