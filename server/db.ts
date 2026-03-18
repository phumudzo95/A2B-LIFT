import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const dbUrl = process.env.DATABASE_URL;
const requireSsl = dbUrl.includes("neon.tech") || dbUrl.includes("supabase");
export const pool = new Pool({
  connectionString: dbUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
