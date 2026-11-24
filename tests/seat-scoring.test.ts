import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyOverrides, computeWeights, scoreScreening } from "../src/lib/seat-scoring";
import { parseSeatMap, type Seat } from "../src/lib/vieshow/seat-parser";

const hall = parseSeatMap(readFileSync("tests/fixtures/vieshow/session-seats-TP-1888630.html", "utf8"));
const empty = hall.seats.map((s) => (s.status === "sold" ? { ...s, status: "available" as const } : s));

describe("computeWeights", () => {
  const w = computeWeights(empty);
  const by = (l: string) => w.find((s) => s.label === l)!.weight;
  it("all weights are within 0..10, wheelchair is 0", () => {
    expect(w.every((s) => s.weight >= 0 && s.weight <= 10)).toBe(true);
    expect(w.filter((s) => s.status === "wheelchair").every((s) => s.weight === 0)).toBe(true);
  });
  it("centre of the back-middle beats the front corner and the back corner", () => {
    expect(by("H10")).toBeGreaterThan(by("A01"));
    expect(by("H10")).toBeGreaterThan(by("M20"));
    expect(by("H10")).toBeGreaterThan(9);
  });
  it("is left/right symmetric on a symmetric grid", () => {
    const grid: Seat[] = [];
    for (let y = 0; y < 7; y++) for (let x = 0; x < 11; x++) grid.push({ label: `R${y}-${x}`, row: "R", number: x, x, y, status: "available" });
    const g = computeWeights(grid);
    const at = (x: number, y: number) => g.find((s) => s.x === x && s.y === y)!.weight;
    for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) expect(at(x, y)).toBeCloseTo(at(10 - x, y), 5);
  });
});

describe("scoreScreening", () => {
  const w = computeWeights(empty);
  it("empty hall = 100% good seats", () => {
    const s = scoreScreening(w, new Set());
    expect(s.goodRatio).toBe(1);
    expect(s.availableSeats).toBe(s.totalSeats);
  });
  it("all sold = zero", () => {
    const s = scoreScreening(w, new Set(w.map((x) => x.label)));
    expect(s).toMatchObject({ availableSeats: 0, goodScore: 0, goodRatio: 0, bestPairScore: 0 });
  });
  it("selling the best seat lowers the score", () => {
    const best = [...w].sort((a, b) => b.weight - a.weight)[0];
    const s = scoreScreening(w, new Set([best.label]));
    expect(s.goodScore).toBeLessThan(scoreScreening(w, new Set()).goodScore);
    expect(s.availableSeats).toBe(scoreScreening(w, new Set()).availableSeats - 1);
  });
  it("uses the real sold seats of the fixture by default", () => {
    const s = scoreScreening(computeWeights(hall.seats));
    expect(s.totalSeats - s.availableSeats).toBe(46);
    expect(s.goodRatio).toBeGreaterThan(0);
    expect(s.goodRatio).toBeLessThan(1);
  });
  it("pairs never span an aisle", () => {
    const seats: Seat[] = [
      { label: "A01", row: "A", number: 1, x: 0, y: 0, status: "available" },
      { label: "A02", row: "A", number: 2, x: 2, y: 0, status: "available" }, // aisle at x=1
    ];
    expect(scoreScreening(computeWeights(seats)).bestPairScore).toBe(0);
  });
});

describe("applyOverrides", () => {
  it("scales by seat and row, capped at 10", () => {
    const w = computeWeights(empty);
    const o = applyOverrides(w, { row: { A: 0.3 }, seat: { H10: 2 } });
    expect(o.find((s) => s.label === "A05")!.weight).toBeCloseTo(w.find((s) => s.label === "A05")!.weight * 0.3, 1);
    expect(o.find((s) => s.label === "H10")!.weight).toBeLessThanOrEqual(10);
  });
});
