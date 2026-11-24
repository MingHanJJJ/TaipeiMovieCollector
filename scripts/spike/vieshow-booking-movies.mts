// Phase 0 spike (read-only): choose cinema TP in the booking UI, load the movie list, log requests. No ticket selection.
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
page.on("response", async (r) => {
  const t = r.request().resourceType();
  if (["document", "xhr", "fetch"].includes(t) && !/google|mpulse|analytics/.test(r.url()))
    log.push(`${r.status()} ${r.request().method()} ${t} ${r.url()}`);
});
page.on("framenavigated", (f) => log.push(`FRAME ${f.url()}`));
await page.goto("https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx", { timeout: 45000 });
await page.waitForTimeout(2000);
const opts = await page.$$eval("#theater option", (o) => o.map((x) => `${(x as HTMLOptionElement).value}=${x.textContent?.trim()}`));
console.log("theater options:", opts.join(" | "));
const tp = opts.find((o) => o.includes("信義"));
console.log("TP option:", tp);
await page.selectOption("#theater", { label: tp!.split("=")[1] });
await page.waitForTimeout(1500);
// (button is hidden; selection auto-loads)
await page.waitForTimeout(6000);
console.log("url:", page.url(), "frames:", page.frames().map((f) => f.url()).join(", "));
for (const f of page.frames()) {
  const t = (await f.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 500);
  console.log("FRAME BODY", f.url().slice(0, 100), "::", t);
}
writeFileSync(join(OUT, "booking-movies.html"), await page.content());
for (const [i, f] of page.frames().entries()) writeFileSync(join(OUT, `frame${i}.html`), await f.content().catch(() => ""));
await page.screenshot({ path: join(OUT, "booking-movies.png"), fullPage: true });
console.log(log.join("\n"));
await browser.close();
