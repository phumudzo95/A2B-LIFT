// One-shot migration: fix selected_route_id column type and add any missing route columns
// Usage: DATABASE_URL=... node scripts/fix-selected-route-column.js

const { Client } = require("pg");

const sql = `
-- Fix: selected_route_id was created as smallint but must be text
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rides'
      AND column_name = 'selected_route_id'
      AND data_type != 'text'
  ) THEN
    ALTER TABLE rides
      ALTER COLUMN selected_route_id TYPE text USING selected_route_id::text;
    RAISE NOTICE 'selected_route_id column converted to text';
  ELSE
    RAISE NOTICE 'selected_route_id already text or does not exist — skipping alter';
  END IF;
END
$$;

-- Add column if it was never created
ALTER TABLE rides ADD COLUMN IF NOT EXISTS selected_route_id text;

-- Other route-related columns that may be missing
ALTER TABLE rides ADD COLUMN IF NOT EXISTS selected_route_distance_km real;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS actual_fare real;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_currency text DEFAULT 'ZAR';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS route_selected_at timestamp;
`;

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL environment variable is required");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to database");

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("MIGRATION_OK");

    // Verify
    const verify = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'rides'
        AND column_name IN (
          'selected_route_id',
          'selected_route_distance_km',
          'actual_fare',
          'route_currency',
          'route_selected_at'
        )
      ORDER BY column_name;
    `);
    console.log("\nVerified columns:");
    verify.rows.forEach((r) => console.log(`  ${r.column_name}: ${r.data_type}`));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MIGRATION_FAILED:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
