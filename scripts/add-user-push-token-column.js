// One-shot migration: ensure users.push_token exists for rider device notifications
// Usage: DATABASE_URL=... node scripts/add-user-push-token-column.js

const { Client } = require("pg");

const sql = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token text;
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
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");

    const verify = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'push_token'
      LIMIT 1;
    `);

    if (verify.rows.length === 0) {
      throw new Error("push_token column verification failed");
    }

    console.log("MIGRATION_OK users.push_token:", verify.rows[0].data_type);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("MIGRATION_FAILED:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
