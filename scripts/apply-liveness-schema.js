const { Client } = require("pg");

const sql = `
ALTER TABLE rides ADD COLUMN IF NOT EXISTS cash_selfie_url text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS liveness_status text DEFAULT 'not_required';
ALTER TABLE rides ADD COLUMN IF NOT EXISTS liveness_provider text;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS liveness_session_id varchar;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS liveness_score real;
ALTER TABLE rides ADD COLUMN IF NOT EXISTS liveness_verified_at timestamp;

CREATE TABLE IF NOT EXISTS liveness_sessions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES users(id),
  provider text NOT NULL DEFAULT 'mock',
  status text NOT NULL DEFAULT 'pending',
  challenge_code text NOT NULL,
  selfie_url text,
  verified_photo_url text,
  ride_id varchar,
  score real,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  error_reason text,
  expires_at timestamp NOT NULL,
  verified_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Add columns if table already exists (idempotent)
ALTER TABLE liveness_sessions ADD COLUMN IF NOT EXISTS verified_photo_url text;
ALTER TABLE liveness_sessions ADD COLUMN IF NOT EXISTS ride_id varchar;

CREATE INDEX IF NOT EXISTS idx_liveness_sessions_user_status
  ON liveness_sessions (user_id, status);
`;

(async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("MIGRATION_OK");

    const verifyColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'rides'
      AND column_name IN (
        'cash_selfie_url',
        'liveness_status',
        'liveness_provider',
        'liveness_session_id',
        'liveness_score',
        'liveness_verified_at'
      )
      ORDER BY column_name;
    `);

    const verifyTable = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'liveness_sessions';
    `);

    console.log("RIDES_COLUMNS:", verifyColumns.rows.map((r) => r.column_name).join(", "));
    console.log("LIVENESS_TABLE_EXISTS:", verifyTable.rows.length > 0);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MIGRATION_ERROR:", e.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
})();
