// usage: tsx scripts/dev/shot-one.mts <url> <out.png> [width] [height]
import { chromium } from "playwright";
const [url, out, w, h] = process.argv.slice(2);
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: Number(w ?? 1280), height: Number(h ?? 1100) }, locale: "zh-TW" })).newPage();
await p.goto(url, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
const imgs = await p.locator("article img").evaluateAll((els) => els.map((e) => ({ ok: (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth > 0 })));
console.log("posters in DOM:", imgs.length, "| loaded:", imgs.filter((i) => i.ok).length);
await p.screenshot({ path: out });
await b.close();
