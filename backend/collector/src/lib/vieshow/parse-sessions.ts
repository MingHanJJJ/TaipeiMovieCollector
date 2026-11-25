import * as cheerio from "cheerio";
import { parseVersionTitle, type VersionTitle } from "./parse-title";

export interface ParsedSession {
  sessionId: string;
  /** "YYYY-MM-DD" (Asia/Taipei) */
  date: string;
  /** "HH:mm", hours may be >= 24 for after-midnight shows */
  time: string;
  startsAt: Date;
}

export interface ParsedSessionsPage extends VersionTitle {
  titleEn?: string;
  runtimeMin?: number;
  ratingClass?: string;
  sessions: ParsedSession[];
}

/** Vieshow's CSS badge classes -> rating (badge glyph taken from ticketing.css: 普 護 輔 限 待). 12+/15+ is not distinguishable there. */
export const RATING_BY_CLASS: Record<string, string> = {
  general: "普遍級",
  childview: "保護級",
  bigchild: "輔導級",
  teenager: "輔導級",
  pg: "輔導級",
  adult: "限制級",
  needCheck: "待審",
};

/** "2026-11-26" + "10:35" in Asia/Taipei (UTC+8, no DST) -> Date. Hours >= 24 roll into the next day. */
export function taipeiToDate(date: string, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(new Date(`${date}T00:00:00+08:00`).getTime() + (h * 60 + m) * 60_000);
}

function parseRuntime(text: string): number | undefined {
  const h = /(\d+)\s*時/.exec(text)?.[1];
  const m = /(\d+)\s*分/.exec(text)?.[1];
  if (h === undefined && m === undefined) return undefined;
  return Number(h ?? 0) * 60 + Number(m ?? 0);
}

/** Parse ticket.aspx?cinema=1|TP&movie=HOxxxx (all sessions of one movie version). */
export function parseSessionsPage(html: string): ParsedSessionsPage {
  const $ = cheerio.load(html);
  const h1 = $(".movieDescribe h1").first();
  if (h1.length === 0) throw new Error("movie header not found (blocked page or layout changed)");

  const ratingClassAttr = h1.find("span").first().attr("class")?.trim().split(/\s+/)[0];
  const sessions: ParsedSession[] = [];
  $(".movieTime .movieDay").each((_, day) => {
    const dm = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec($(day).find("h4").first().text());
    if (!dm) return;
    const date = `${dm[1]}-${dm[2].padStart(2, "0")}-${dm[3].padStart(2, "0")}`;
    $(day).find("ul.bookList > li").each((__, li) => {
      const a = $(li).find("a[href*='txtSessionId=']").first();
      const sessionId = /txtSessionId=(\d+)/.exec(a.attr("href") ?? "")?.[1];
      const time = /(\d{1,2}):(\d{2})/.exec(a.text());
      if (!sessionId || !time) return;
      const hhmm = `${time[1].padStart(2, "0")}:${time[2]}`;
      sessions.push({
        sessionId,
        date,
        time: hhmm,
        startsAt: taipeiToDate(date, hhmm),
      });
    });
  });

  const h1Clone = h1.clone();
  h1Clone.find("span").remove();
  return {
    ...parseVersionTitle(h1Clone.text()),
    titleEn: $(".movieDescribe h2").first().text().replace(/\s+/g, " ").replace(/^[(（][^)）]*[)）]\s*/, "").trim() || undefined,
    runtimeMin: parseRuntime($(".movieDescribe h3").first().text()),
    ratingClass: ratingClassAttr ? (RATING_BY_CLASS[ratingClassAttr] ?? ratingClassAttr) : undefined,
    sessions,
  };
}
