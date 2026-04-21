const { Client } = require("pg");

const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS rewards_balance real DEFAULT 0;
ALTER TABLE users ALTER COLUMN rewards_balance SET DEFAULT 0;
UPDATE users SET rewards_balance = 0 WHERE rewards_balance IS NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_user_id varchar REFERENCES users(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code_unique
  ON users (referral_code)
  WHERE referral_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_referred_by_user_id
  ON users (referred_by_user_id);

CREATE TABLE IF NOT EXISTS referral_events (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  referrer_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_user_id varchar NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  referral_code_used text NOT NULL,
  status text NOT NULL DEFAULT 'registered',
  total_rewards real DEFAULT 0,
  first_reward_at timestamp,
  last_reward_at timestamp,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_referral_events_referrer_user_id
  ON referral_events (referrer_user_id);

CREATE INDEX IF NOT EXISTS idx_referral_events_status
  ON referral_events (status);

CREATE TABLE IF NOT EXISTS reward_transactions (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referral_event_id varchar REFERENCES referral_events(id) ON DELETE SET NULL,
  source_user_id varchar REFERENCES users(id) ON DELETE SET NULL,
  ride_id varchar REFERENCES rides(id) ON DELETE SET NULL,
  type text NOT NULL,
  amount real NOT NULL,
  balance_before real NOT NULL,
  balance_after real NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'completed',
  reference varchar,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_user_id
  ON reward_transactions (user_id);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_ride_id
  ON reward_transactions (ride_id);

CREATE INDEX IF NOT EXISTS idx_reward_transactions_referral_event_id
  ON reward_transactions (referral_event_id);

CREATE TABLE IF NOT EXISTS reward_cashouts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount real NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  bank_name text,
  account_number text,
  account_holder text,
  phone text,
  notes text,
  reviewed_by_admin_id varchar REFERENCES users(id) ON DELETE SET NULL,
  requested_at timestamp DEFAULT now(),
  reviewed_at timestamp,
  paid_at timestamp
);

CREATE INDEX IF NOT EXISTS idx_reward_cashouts_user_id
  ON reward_cashouts (user_id);

CREATE INDEX IF NOT EXISTS idx_reward_cashouts_status
  ON reward_cashouts (status);
`;

(async () => {
  const databaseUrl = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("SUPABASE_DB_URL or DATABASE_URL is required");
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

    const verifyUserColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name IN ('rewards_balance', 'referral_code', 'referred_by_user_id')
      ORDER BY column_name;
    `);

    const verifyTables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name IN ('referral_events', 'reward_transactions', 'reward_cashouts')
      ORDER BY table_name;
    `);

    console.log("MIGRATION_OK");
    console.log("USER_COLUMNS:", verifyUserColumns.rows.map((row) => row.column_name).join(", "));
    console.log("TABLES:", verifyTables.rows.map((row) => row.table_name).join(", "));
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MIGRATION_ERROR:", error.message);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
})();