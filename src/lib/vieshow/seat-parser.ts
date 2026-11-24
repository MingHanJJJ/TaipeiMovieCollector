import * as cheerio from "cheerio";

export type SeatStatus = "available" | "sold" | "wheelchair";

export interface Seat {
  /** e.g. "F10" */
  label: string;
  row: string;
  /** seat number printed on the ticket, e.g. 10 */
  number: number;
  /** physical grid column (aisles included), 0-based */
  x: number;
  /** physical grid row, 0 = closest to the screen */
  y: number;
  status: SeatStatus;
}

export interface ParsedSeatMap {
  movieZh: string;
  movieEn: string;
  /** "YYYY-MM-DD HH:mm" in Asia/Taipei, as printed by Vieshow */
  startsAtLocal: string;
  cinemaName: string;
  hallName: string;
  hallNo: string;
  gridRows: number;
  gridCols: number;
  seats: Seat[];
}

const text = ($: cheerio.CheerioAPI, sel: string) => $(sel).first().text().replace(/\s+/g, " ").trim();

/** Parse Vieshow's server-rendered SessionSeats.aspx page. Pure function, no I/O. */
export function parseSeatMap(html: string): ParsedSeatMap {
  const $ = cheerio.load(html);
  const grid = $("#GridViewSessionSeats");
  if (grid.length === 0) throw new Error("SessionSeats grid not found (blocked page or layout changed)");

  const seats: Seat[] = [];
  let gridCols = 0;
  const rows = grid.find("tr").toArray();
  rows.forEach((tr, y) => {
    const cells = $(tr).children("td").toArray();
    gridCols = Math.max(gridCols, cells.length);
    cells.forEach((td, x) => {
      const label$ = $(td).find("div.label[title]").first();
      if (label$.length) {
        const label = label$.attr("title")!.trim();
        const m = /^([A-Za-z]+)(\d+)$/.exec(label);
        if (!m) return;
        seats.push({
          label,
          row: m[1],
          number: parseInt(m[2], 10),
          x,
          y,
          status: label$.hasClass("label-danger") ? "sold" : "available",
        });
      } else if ($(td).find('img[src*="wheelchair"]').length) {
        seats.push({ label: `W${y}-${x}`, row: "", number: 0, x, y, status: "wheelchair" });
      }
    });
  });

  const dt = text($, "#LabelSession_dtmDateTime");
  return {
    movieZh: text($, "#LabelMovie_strName"),
    movieEn: text($, "#LabelMovie_strNameEn"),
    startsAtLocal: /\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.exec(dt)?.[0] ?? dt,
    cinemaName: text($, "#LabelCinema_strName"),
    hallName: text($, "#LabelScreen_strName"),
    hallNo: $("#LabelScreen_strName").attr("title") ?? "",
    gridRows: rows.length,
    gridCols,
    seats,
  };
}
