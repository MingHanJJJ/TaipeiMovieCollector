// Dev helper: screenshot the running app. usage: tsx scripts/dev/screenshot.mts <outDir>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const out = process.argv[2]; mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const errors: string[] = [];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "zh-TW" });
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:3000/?date=2026-11-24", { waitUntil: "networkidle" });
await page.screenshot({ path: `${out}/01-all-cinemas.png` });
console.log("cards:", await page.locator("article").count(), "| cinema chips:", await page.locator("fieldset label").count());

// uncheck all but TP + QS via the real UI
await page.getByRole("button", { name: "清除" }).click();
await page.waitForTimeout(800);
console.log("after clear -> url:", page.url(), "| empty-state shown:", await page.getByText("請至少勾選一間影城").count());
for (const name of ["信義", "京站"]) await page.locator("fieldset label", { hasText: name }).click();
await page.waitForTimeout(1500);
console.log("after pick -> url:", decodeURIComponent(page.url()), "| cards:", await page.locator("article").count());
const rowLabels = await page.locator("article").first().locator('[role="rowheader"]').allInnerTexts();
console.log("first card rows:", rowLabels.join(", "));
await page.screenshot({ path: `${out}/02-two-cinemas.png` });

// persistence: reload bare URL, selection should be restored from localStorage
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(1500);
console.log("restored url:", decodeURIComponent(page.url()));

// search
await page.fill('input[type="search"]', "沙丘");
await page.waitForTimeout(1500);
console.log("search -> cards:", await page.locator("article").count(), "| url:", decodeURIComponent(page.url()));
await page.screenshot({ path: `${out}/03-search.png` });

// mobile
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-TW", deviceScaleFactor: 2 });
const mp = await m.newPage();
await mp.goto("http://localhost:3000/?date=2026-11-24&c=TP,QS", { waitUntil: "networkidle" });
await mp.screenshot({ path: `${out}/04-mobile.png` });
console.log("mobile horizontal page scroll:", await mp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth));
console.log("console errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
