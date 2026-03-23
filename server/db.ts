import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema";

const dbUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;

if (!dbUrl) {
  throw new Error("SUPABASE_DB_URL or DATABASE_URL must be set.");
}

const requireSsl = dbUrl.includes("supabase") || dbUrl.includes("neon.tech");
export const pool = new Pool({
  connectionString: dbUrl,
  ssl: requireSsl ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
