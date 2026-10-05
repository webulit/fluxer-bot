import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Runs on every startup, so no manual migration step is needed.
export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      balance    BIGINT NOT NULL DEFAULT 0,
      last_daily TIMESTAMPTZ,
      xp         INTEGER NOT NULL DEFAULT 0,
      level      INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS warnings (
      id         SERIAL PRIMARY KEY,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      mod_id     TEXT NOT NULL,
      reason     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function ensureUser(guildId, userId, db = pool) {
  await db.query(
    'INSERT INTO users (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [guildId, userId],
  );
}
