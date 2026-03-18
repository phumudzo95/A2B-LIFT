import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../shared/schema";

if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_HOST) {
  throw new Error("DATABASE_URL must be set. Did you forget to provision a database?");
}

// Use individual connection params when available to avoid URL password-encoding issues
const poolConfig = process.env.SUPABASE_DB_HOST
  ? {
      host: process.env.SUPABASE_DB_HOST,
      port: 5432,
      database: "postgres",
      user: "postgres",
      password: process.env.SUPABASE_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
    }
  : {
      connectionString: process.env.DATABASE_URL!,
      ssl: process.env.DATABASE_URL!.includes("supabase") || process.env.DATABASE_URL!.includes("neon.tech")
        ? { rejectUnauthorized: false }
        : false,
    };

export const pool = new Pool(poolConfig as any);
export const db = drizzle(pool, { schema });
