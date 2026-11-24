import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Hard stop for seat-page requests. One 403 (Akamai "Access Denied") trips it for 24 h.
 * No retry, no IP rotation, no proxy, no fingerprint tweaks — by design (see plan.md).
 */
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_STATE_FILE = ".state/vieshow-circuit.json";

interface State { trippedAt: number; reason: string }

export class CircuitOpenError extends Error {
  constructor(public readonly until: Date, reason: string) {
    super(`Vieshow circuit breaker is OPEN until ${until.toISOString()} (${reason})`);
  }
}

export class CircuitBreaker {
  constructor(private file = DEFAULT_STATE_FILE, private now: () => number = Date.now) {}

  private read(): State | null {
    try { return JSON.parse(readFileSync(this.file, "utf8")) as State; } catch { return null; }
  }

  /** Throws CircuitOpenError while the cooldown is active. Call before EVERY request. */
  assertClosed(): void {
    const s = this.read();
    if (s && this.now() < s.trippedAt + COOLDOWN_MS) throw new CircuitOpenError(new Date(s.trippedAt + COOLDOWN_MS), s.reason);
  }

  trip(reason: string): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ trippedAt: this.now(), reason } satisfies State));
  }

  /** Manual override, only for the human owner of the project. */
  reset(): void { try { writeFileSync(this.file, "null"); } catch { /* nothing to reset */ } }
}

export const isBlockedStatus = (status: number) => status === 403 || status === 429;
