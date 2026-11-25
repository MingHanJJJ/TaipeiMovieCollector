// Idempotent seed of the cinemas we track. ids/codes come from the Vieshow booking dropdown (#theater).
import "../../src/env";
import { db } from "../../src/db/client";
import { cinemas } from "../../src/db/schema";

const rows = [
  { provider: "vieshow", code: "TP", providerCinemaId: "1", name: "台北信義威秀影城", region: "雙北" },
  { provider: "vieshow", code: "MU", providerCinemaId: "21", name: "MUVIE CINEMAS 台北松仁", region: "雙北" },
  { provider: "vieshow", code: "MUC", providerCinemaId: "21", name: "MUVIE CINEMAS 台北松仁(MUCROWN)", region: "雙北" },
  { provider: "vieshow", code: "NL", providerCinemaId: "35", name: "台北南港 LaLaport威秀影城", region: "雙北" },
  { provider: "vieshow", code: "QS", providerCinemaId: "12", name: "台北京站威秀影城", region: "雙北" },
  { provider: "vieshow", code: "TX", providerCinemaId: "34", name: "台北西門威秀影城", region: "雙北" },
  { provider: "vieshow", code: "BQ", providerCinemaId: "16", name: "板橋大遠百威秀影城", region: "雙北" },
  { provider: "vieshow", code: "GM", providerCinemaId: "30", name: "中和環球威秀影城", region: "雙北" },
  { provider: "vieshow", code: "HU", providerCinemaId: "32", name: "新店裕隆城威秀影城", region: "雙北" },
];

for (const r of rows) {
  await db.insert(cinemas).values(r).onConflictDoUpdate({
    target: [cinemas.provider, cinemas.code],
    set: { providerCinemaId: r.providerCinemaId, name: r.name, region: r.region },
  });
}
console.log(`seeded ${rows.length} cinemas`);
process.exit(0);
