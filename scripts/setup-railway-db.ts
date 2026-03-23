import { Pool } from "pg";

const DATABASE_URL = process.env.DATABASE_URL!;

async function setupRailwayDb() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log("Connected to database, checking schema...");

    const tableCheck = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    console.log("Existing tables:", tableCheck.rows.map((r: any) => r.table_name));

    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payments' AND table_schema = 'public'
    `);
    const paymentCols = colCheck.rows.map((r: any) => r.column_name);
    console.log("Payment table columns:", paymentCols);

    if (paymentCols.includes("transaction_ref") && !paymentCols.includes("provider")) {
      console.log("Renaming transaction_ref → provider...");
      await client.query(`ALTER TABLE payments RENAME COLUMN transaction_ref TO provider`);
      console.log("Done.");
    } else {
      console.log("provider column already exists or transaction_ref not found — no rename needed.");
    }

    console.log("Schema fix complete.");
  } finally {
    client.release();
    await pool.end();
  }
}

setupRailwayDb().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
