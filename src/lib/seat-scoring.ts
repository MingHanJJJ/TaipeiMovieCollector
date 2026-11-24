import type { Seat } from "./vieshow/seat-parser";

export interface WeightOptions {
  /** 0 = screen row, 1 = back row. Where the sweet spot sits. */
  idealDepth?: number;
  /** spread of the sweet spot along depth (normalised) */
  sigmaDepth?: number;
  /** spread along the width (normalised to half-width) */
  sigmaWidth?: number;
}

export interface WeightedSeat extends Seat {
  weight: number; // 0..10
}

export const DEFAULT_GOOD_THRESHOLD = 7;
const DEFAULTS: Required<WeightOptions> = { idealDepth: 0.62, sigmaDepth: 0.28, sigmaWidth: 0.55 };

/** Geometry-based baseline weights. Manual per-hall overrides are applied on top (see applyOverrides). */
export function computeWeights(seats: Seat[], opts: WeightOptions = {}): WeightedSeat[] {
  const o = { ...DEFAULTS, ...opts };
  const real = seats.filter((s) => s.status !== "wheelchair");
  if (real.length === 0) return seats.map((s) => ({ ...s, weight: 0 }));
  const xs = real.map((s) => s.x), ys = real.map((s) => s.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2;
  const halfW = Math.max((maxX - minX) / 2, 1);
  const depthSpan = Math.max(maxY - minY, 1);

  return seats.map((s) => {
    if (s.status === "wheelchair") return { ...s, weight: 0 };
    const dx = (s.x - cx) / halfW;
    const dy = (s.y - minY) / depthSpan - o.idealDepth;
    const w = 10 * Math.exp(-(dx * dx) / (2 * o.sigmaWidth ** 2) - (dy * dy) / (2 * o.sigmaDepth ** 2));
    return { ...s, weight: Math.round(w * 100) / 100 };
  });
}

/** multiplier overrides keyed by seat label, e.g. { A01: 0.3 } or by row, e.g. { A: 0.3 } */
export function applyOverrides(
  seats: WeightedSeat[],
  overrides: { seat?: Record<string, number>; row?: Record<string, number> },
): WeightedSeat[] {
  return seats.map((s) => {
    const m = (overrides.seat?.[s.label] ?? 1) * (overrides.row?.[s.row] ?? 1);
    return m === 1 ? s : { ...s, weight: Math.min(10, Math.round(s.weight * m * 100) / 100) };
  });
}

export interface ScreeningScore {
  availableSeats: number;
  totalSeats: number;
  goodScore: number;
  /** goodScore / best possible goodScore for the empty hall, 0..1 */
  goodRatio: number;
  totalScore: number;
  /** best weight sum of two adjacent available seats in the same row (no aisle between) */
  bestPairScore: number;
}

export function scoreScreening(
  weighted: WeightedSeat[],
  /** labels of seats that are sold. If omitted, each seat's own `status` is used. */
  soldLabels?: Set<string>,
  threshold = DEFAULT_GOOD_THRESHOLD,
): ScreeningScore {
  const bookable = weighted.filter((s) => s.status !== "wheelchair");
  const isSold = (s: WeightedSeat) => (soldLabels ? soldLabels.has(s.label) : s.status === "sold");
  const avail = bookable.filter((s) => !isSold(s));
  const sum = (a: WeightedSeat[]) => a.reduce((t, s) => t + s.weight, 0);
  const good = (a: WeightedSeat[]) => a.filter((s) => s.weight >= threshold);
  const maxGood = sum(good(bookable));

  const byPos = new Map(avail.map((s) => [`${s.y}:${s.x}`, s]));
  let bestPair = 0;
  for (const s of avail) {
    const right = byPos.get(`${s.y}:${s.x + 1}`);
    if (right) bestPair = Math.max(bestPair, s.weight + right.weight);
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    availableSeats: avail.length,
    totalSeats: bookable.length,
    goodScore: r2(sum(good(avail))),
    goodRatio: maxGood === 0 ? 0 : Math.round((sum(good(avail)) / maxGood) * 1000) / 1000,
    totalScore: r2(sum(avail)),
    bestPairScore: r2(bestPair),
  };
}
