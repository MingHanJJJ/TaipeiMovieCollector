import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse one pool across Next.js hot reloads in dev.
const g = globalThis as unknown as { __tmcPool?: Pool; __tmcDb?: NodePgDatabase<typeof schema> };

function connect(): NodePgDatabase<typeof schema> {
  if (!g.__tmcDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
    g.__tmcPool = new Pool({ connectionString: url, max: 10 });
    g.__tmcDb = drizzle({ client: g.__tmcPool, schema });
  }
  return g.__tmcDb;
}

// Lazy: importing this module must not require a database (e.g. `next build` in Docker).
export const db = new Proxy({} as NodePgDatabase<typeof schema>, {
  get(_t, prop) {
    const real = connect();
    const v = Reflect.get(real, prop, real);
    return typeof v === "function" ? v.bind(real) : v;
  },
});
export { schema };
