import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSeatMap } from "../src/lib/vieshow/seat-parser";

const html = readFileSync("tests/fixtures/vieshow/session-seats-TP-1888630.html", "utf8");

describe("parseSeatMap (TP hall 11, session 1888630)", () => {
  const m = parseSeatMap(html);
  it("reads the header", () => {
    expect(m.movieZh).toBe("(數位)沙丘：第三部");
    expect(m.movieEn).toBe("DUNE PART THREE");
    expect(m.startsAtLocal).toBe("2026-12-15 19:00");
    expect(m.cinemaName).toBe("台北信義威秀影城");
    expect(m.hallNo).toBe("11");
    expect(m.hallName).toBe("第11廳");
  });
  it("counts seats", () => {
    const normal = m.seats.filter((s) => s.status !== "wheelchair");
    expect(normal).toHaveLength(254);
    expect(normal.filter((s) => s.status === "sold")).toHaveLength(46);
    expect(m.seats.filter((s) => s.status === "wheelchair")).toHaveLength(3);
    expect(m.gridCols).toBe(23);
  });
  it("keeps physical positions (aisles are gaps)", () => {
    const a1 = m.seats.find((s) => s.label === "A01")!;
    expect(a1).toMatchObject({ row: "A", number: 1, y: 0, status: "available" });
    expect(m.seats.find((s) => s.label === "F10")!.status).toBe("sold");
    const xs = m.seats.filter((s) => s.row === "A").map((s) => s.x).sort((a, b) => a - b);
    expect(xs.some((x, i) => i > 0 && x - xs[i - 1] > 1)).toBe(true); // aisle gap
  });
  it("throws on a blocked page", () => {
    expect(() => parseSeatMap("<html><title>Access Denied</title></html>")).toThrow(/grid not found/);
  });
});
