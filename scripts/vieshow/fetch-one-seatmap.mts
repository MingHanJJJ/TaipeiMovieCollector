// Usage: tsx scripts/vieshow/fetch-one-seatmap.ts <cinemaId> <sessionId>   (makes at most ONE request)
import { SeatFetcher } from "./seat-fetcher";
import { CircuitOpenError } from "../../src/lib/vieshow/circuit-breaker";
import { computeWeights, scoreScreening } from "../../src/lib/seat-scoring";

const [cinema, session] = process.argv.slice(2);
if (!cinema || !session) throw new Error("usage: fetch-one-seatmap <cinemaId> <sessionId>");
const f = new SeatFetcher();
try {
  const m = await f.fetchSeatMap(cinema, session);
  const score = scoreScreening(computeWeights(m.seats));
  console.log(JSON.stringify({ movie: m.movieZh, startsAt: m.startsAtLocal, hall: m.hallName, seats: m.seats.length, score }, null, 2));
} catch (e) {
  if (e instanceof CircuitOpenError) { console.error("STOPPED:", e.message); process.exitCode = 2; } else throw e;
} finally { await f.close(); }
