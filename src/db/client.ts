import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across Next.js hot reloads in dev.
const g = globalThis as unknown as { __tmcPool?: Pool };

function pool(): Pool {
  if (!g.__tmcPool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
    g.__tmcPool = new Pool({ connectionString: url, max: 10 });
  }
  return g.__tmcPool;
}

export const db = drizzle({ client: pool(), schema });
export { schema };
