import * as cheerio from "cheerio";
import { parseVersionTitle, type VersionTitle } from "./parse-title";

export interface ListedMovie extends VersionTitle {
  /** e.g. "HO00018172" — one per format/language version */
  providerMovieId: string;
}

/** Parse ticket.aspx?cinema=1|TP (the per-cinema movie list). */
export function parseMovieList(html: string): ListedMovie[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const out: ListedMovie[] = [];
  $("a[href*='movie=']").each((_, a) => {
    const id = /[?&]movie=([A-Za-z0-9]+)/.exec($(a).attr("href") ?? "")?.[1];
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ providerMovieId: id, ...parseVersionTitle($(a).text()) });
  });
  if (out.length === 0) throw new Error("no movies found (blocked page or layout changed)");
  return out;
}
