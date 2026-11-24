import { describe, expect, it } from "vitest";
import {
  axisFor, dayWindow, formatRank, formatTier, packLanesByTier, formatClock, groupByMovie, isIsoDate, minutesOfDay, packLanes, shortCinemaName, formatKind, bookingHref,
  type DayScreening,
} from "../src/lib/timeline";

const base = { movieId: 1, titleZh: "片A", titleEn: null, runtimeMin: 100, ratingClass: null, posterUrl: null, tmdbId: null, provider: "vieshow", providerCinemaId: "1", providerMovieId: "HO1", format: "數位", language: "英", endsAt: null };
const sc = (id: number, cinemaCode: string, iso: string, extra: Partial<DayScreening> = {}): DayScreening => ({
  ...base, id, cinemaCode, cinemaName: cinemaCode, startsAt: new Date(iso), ...extra,
});

describe("time helpers", () => {
  it("minutesOfDay is relative to Taipei midnight", () => {
    expect(minutesOfDay(new Date("2026-11-26T02:35:00Z"), "2026-11-26")).toBe(10 * 60 + 35); // 10:35 +08
    expect(minutesOfDay(new Date("2026-11-26T17:10:00Z"), "2026-11-26")).toBe(25 * 60 + 10); // 01:10 next day
  });
  it("formatClock wraps past midnight", () => {
    expect(formatClock(635)).toBe("10:35");
    expect(formatClock(25 * 60 + 10)).toBe("01:10");
  });
  it("dayWindow is 06:00→06:00 Taipei", () => {
    const w = dayWindow("2026-11-26");
    expect(w.start.toISOString()).toBe("2026-11-25T22:00:00.000Z");
    expect(w.end.getTime() - w.start.getTime()).toBe(24 * 3600_000);
  });
  it("validates iso dates", () => {
    expect(isIsoDate("2026-11-26")).toBe(true);
    expect(isIsoDate("2026-13-40")).toBe(false);
    expect(isIsoDate("hello")).toBe(false);
    expect(isIsoDate(undefined)).toBe(false);
  });
  it("shortens cinema names", () => {
    expect(shortCinemaName("台北信義威秀影城")).toBe("信義");
    expect(shortCinemaName("MUVIE CINEMAS 台北松仁")).toBe("MUVIE 松仁");
    expect(shortCinemaName("台北南港 LaLaport威秀影城")).toBe("南港 LaLaport");
    expect(shortCinemaName("板橋大遠百威秀影城")).toBe("板橋大遠百");
  });
});

describe("packLanes", () => {
  it("stacks overlapping blocks and reuses free lanes", () => {
    const bs = [
      { startMin: 600, endMin: 710, lane: 0 },
      { startMin: 620, endMin: 730, lane: 0 },
      { startMin: 720, endMin: 800, lane: 0 },
    ];
    expect(packLanes(bs)).toBe(2);
    expect(bs.map((b) => b.lane)).toEqual([0, 1, 0]);
  });
});

describe("groupByMovie", () => {
  const rows = [
    sc(1, "QS", "2026-11-26T06:00:00Z"), // 14:00
    sc(2, "TP", "2026-11-26T02:35:00Z"), // 10:35
    sc(3, "TP", "2026-11-26T10:00:00Z"), // 18:00
    sc(4, "TP", "2026-11-26T03:00:00Z", { movieId: 2, titleZh: "片B" }),
  ];
  const groups = groupByMovie(rows, "2026-11-26", ["TP", "QS"]);
  it("sorts movies by session count and rows by cinema order", () => {
    expect(groups.map((g) => g.titleZh)).toEqual(["片A", "片B"]);
    expect(groups[0].sessionCount).toBe(3);
    expect(groups[0].rows.map((r) => r.cinemaCode)).toEqual(["TP", "QS"]);
    expect(groups[0].rows[0].blocks.map((b) => b.time)).toEqual(["10:35", "18:00"]);
  });
  it("uses runtime + 15 min when endsAt is missing", () => {
    const b = groups[0].rows[0].blocks[0];
    expect(b.endMin - b.startMin).toBe(115);
  });
  it("builds an hour-aligned shared axis", () => {
    const a = axisFor(groups);
    expect(a.startMin % 60).toBe(0);
    expect(a.endMin % 60).toBe(0);
    expect(a.startMin).toBeLessThanOrEqual(10 * 60 + 35);
    expect(a.endMin).toBeGreaterThanOrEqual(18 * 60 + 115);
  });
  it("falls back to a default axis when empty", () => {
    expect(axisFor([])).toEqual({ startMin: 600, endMin: 1440 });
  });
});

describe("format tiers", () => {
  it.each([
    ["IMAX", 0], ["IMAX 3D", 0], ["TITAN", 0], ["IV TITAN", 0], ["4DX", 0], ["IV 4DX 3D", 0], ["MUCROWN", 0], ["GC", 0],
    ["VR", 1], ["LIVE", 1], ["PRE", 1], ["光感應援場", 1], ["IV", 1], ["IV 3D", 1],
    ["數位", 2], ["3D 數位", 2], ["數位 印地語", 2], ["", 2],
  ])("%s -> tier %i", (format, tier) => {
    expect(formatTier(format)).toBe(tier);
  });

  it("puts premium sessions in the top lanes even when they start later", () => {
    const b = (startMin: number, format: string) => ({ startMin, endMin: startMin + 120, lane: 0, format });
    const blocks = [b(600, "數位"), b(660, "數位"), b(900, "IMAX"), b(1000, "VR")];
    expect(packLanesByTier(blocks)).toBe(4); // IMAX | VR | two overlapping digital
    expect(blocks.map((x) => x.lane)).toEqual([2, 3, 0, 1]);
  });

  it("does not reserve empty lanes for tiers that are absent", () => {
    const blocks = [{ startMin: 600, endMin: 700, lane: 0, format: "數位" }];
    expect(packLanesByTier(blocks)).toBe(1);
    expect(blocks[0].lane).toBe(0);
  });

  it("groupByMovie shows an IMAX session above earlier digital ones in the same cinema", () => {
    const rows = [
      sc(1, "TP", "2026-11-26T02:00:00Z", { format: "數位" }), // 10:00
      sc(2, "TP", "2026-11-26T04:00:00Z", { format: "數位" }), // 12:00
      sc(3, "TP", "2026-11-26T10:00:00Z", { format: "IMAX" }), // 18:00
    ];
    const row = groupByMovie(rows, "2026-11-26", ["TP"])[0].rows[0];
    expect(row.lanes).toBe(2);
    expect(row.blocks.find((x) => x.format === "IMAX")!.lane).toBe(0);
    expect(row.blocks.filter((x) => x.format === "數位").every((x) => x.lane === 1)).toBe(true);
  });
});

describe("cinema row order", () => {
  it.each([["IMAX", 0], ["IMAX 3D", 0], ["TITAN", 1], ["4DX", 1], ["MUCROWN", 1], ["VR", 2], ["LIVE", 2], ["數位", 3]])("%s -> rank %i", (f, r) => {
    expect(formatRank(f)).toBe(r);
  });

  it("puts cinemas with IMAX first, then other premium halls, then the rest (ties keep cinema order)", () => {
    const rows = [
      sc(1, "TP", "2026-11-26T02:00:00Z", { format: "4DX" }),
      sc(2, "QS", "2026-11-26T02:00:00Z", { format: "數位" }),
      sc(3, "BQ", "2026-11-26T02:00:00Z", { format: "數位" }),
      sc(4, "BQ", "2026-11-26T08:00:00Z", { format: "IMAX" }), // only a late IMAX session
      sc(5, "HU", "2026-11-26T03:00:00Z", { format: "IMAX" }),
      sc(6, "MU", "2026-11-26T03:00:00Z", { format: "數位" }),
    ];
    const order = ["TP", "MU", "QS", "BQ", "HU"];
    const g = groupByMovie(rows, "2026-11-26", order)[0];
    expect(g.rows.map((r) => r.cinemaCode)).toEqual(["BQ", "HU", "TP", "MU", "QS"]);
  });

  it("keeps the configured order when nobody has special halls", () => {
    const rows = [sc(1, "QS", "2026-11-26T02:00:00Z"), sc(2, "TP", "2026-11-26T02:00:00Z")];
    expect(groupByMovie(rows, "2026-11-26", ["TP", "QS"])[0].rows.map((r) => r.cinemaCode)).toEqual(["TP", "QS"]);
  });
});

describe("groupByMovie merges titles of the same TMDB film", () => {
  it("one card for two movie rows with the same tmdbId", () => {
    const rows = [
      sc(1, "TP", "2026-11-26T02:35:00Z", { movieId: 10, titleZh: "樂園追放", tmdbId: 99 }),
      sc(2, "QS", "2026-11-26T06:00:00Z", { movieId: 11, titleZh: "樂園追放 心之共鳴", tmdbId: 99 }),
      sc(3, "TP", "2026-11-26T08:00:00Z", { movieId: 12, titleZh: "別的片", tmdbId: null }),
    ];
    const g = groupByMovie(rows, "2026-11-26", ["TP", "QS"]);
    expect(g).toHaveLength(2);
    expect(g[0].sessionCount).toBe(2);
    expect(g[0].rows.map((r) => r.cinemaCode)).toEqual(["TP", "QS"]);
  });
});

describe("misc", () => {
  it("classifies formats", () => {
    expect(formatKind("IMAX 3D")).toBe("imax");
    expect(formatKind("IV 4DX 3D")).toBe("4dx");
    expect(formatKind("LIVE")).toBe("live");
    expect(formatKind("數位")).toBe("standard");
    expect(formatKind("TITAN")).toBe("premium");
    expect(formatKind("MUCROWN")).toBe("premium");
  });
  it("builds a Vieshow booking-list link only for vieshow", () => {
    expect(bookingHref({ provider: "vieshow", providerCinemaId: "1", cinemaCode: "TP", providerMovieId: "HO1" }))
      .toBe("https://www.vscinemas.com.tw/vsTicketingN/ticketing/ticket.aspx?cinema=1|TP&movie=HO1");
    expect(bookingHref({ provider: "miramar", providerCinemaId: null, cinemaCode: "MR", providerMovieId: null })).toBeNull();
  });
});
