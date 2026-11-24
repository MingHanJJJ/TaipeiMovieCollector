// Phase 0 spike (read-only): click "一般購票" once, record where it leads. No input, no login, no submit.
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const OUT = process.argv[2]; mkdirSync(OUT, { recursive: true });
chromium.use(stealth());
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ locale: "zh-TW", viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const log: string[] = [];
page.on("response", (r) => { if (["document", "xhr", "fetch"].includes(r.request().resourceType())) log.push(`${r.status()} ${r.request().method()} ${r.request().resourceType()} ${r.url()}`); });
await page.goto("https://www.vscinemas.com.tw/vsweb/", { timeout: 45000 });
await page.waitForTimeout(2000);
await Promise.all([
  page.waitForLoadState("domcontentloaded").catch(() => {}),
  page.click("#btnGoToBookingNormal"),
]);
await page.waitForTimeout(5000);
console.log("landed:", page.url());
console.log("title:", await page.title());
const text = (await page.innerText("body").catch(() => "")).replace(/\s+/g, " ").slice(0, 600);
console.log("body:", text);
console.log("captcha/login hints:", /captcha|驗證碼|登入|login|recaptcha|waiting|排隊/i.test(await page.content()));
writeFileSync(join(OUT, "booking-entry.html"), await page.content());
writeFileSync(join(OUT, "booking-entry.log"), log.join("\n"));
await page.screenshot({ path: join(OUT, "booking-entry.png") });
console.log(log.join("\n"));
await browser.close();
