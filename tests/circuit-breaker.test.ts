import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CircuitBreaker, CircuitOpenError, COOLDOWN_MS, isBlockedStatus } from "../src/lib/vieshow/circuit-breaker";

const file = () => join(mkdtempSync(join(tmpdir(), "cb-")), "state.json");

describe("CircuitBreaker", () => {
  it("is closed by default", () => {
    expect(() => new CircuitBreaker(file()).assertClosed()).not.toThrow();
  });
  it("opens for 24h after a trip, then closes", () => {
    const f = file(); let now = 1_000_000;
    const cb = new CircuitBreaker(f, () => now);
    cb.trip("403");
    expect(() => cb.assertClosed()).toThrow(CircuitOpenError);
    now += COOLDOWN_MS - 1;
    expect(() => cb.assertClosed()).toThrow(CircuitOpenError);
    now += 2;
    expect(() => cb.assertClosed()).not.toThrow();
  });
  it("persists across instances (survives restarts)", () => {
    const f = file();
    new CircuitBreaker(f).trip("403");
    expect(() => new CircuitBreaker(f).assertClosed()).toThrow(CircuitOpenError);
  });
  it("treats 403 and 429 as blocks", () => {
    expect([403, 429, 200, 500].map(isBlockedStatus)).toEqual([true, true, false, false]);
  });
});
