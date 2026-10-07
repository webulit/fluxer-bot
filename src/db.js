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
    ALTER TABLE users ADD COLUMN IF NOT EXISTS last_work TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS moderation_logs (
      id           SERIAL PRIMARY KEY,
      guild_id     TEXT NOT NULL,
      action       TEXT NOT NULL,
      target_id    TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      reason       TEXT,
      metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_moderation_logs_guild_created
      ON moderation_logs (guild_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_moderation_logs_target
      ON moderation_logs (guild_id, target_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS warnings (
      id         SERIAL PRIMARY KEY,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      mod_id     TEXT NOT NULL,
      reason     TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id         TEXT PRIMARY KEY,
      welcome_channel  TEXT,
      welcome_message  TEXT,
      goodbye_channel  TEXT,
      goodbye_message  TEXT,
      autorole_id      TEXT
    );

    CREATE TABLE IF NOT EXISTS autoroles (
      guild_id TEXT NOT NULL,
      role_id  TEXT NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS todos (
      id      SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      text    TEXT NOT NULL,
      done    BOOLEAN NOT NULL DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS shop_items (
      id       SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      name     TEXT NOT NULL,
      price    BIGINT NOT NULL,
      role_id  TEXT
    );

    CREATE TABLE IF NOT EXISTS inventory (
      guild_id TEXT NOT NULL,
      user_id  TEXT NOT NULL,
      item_id  INTEGER NOT NULL,
      qty      INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (guild_id, user_id, item_id)
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS bank BIGINT NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS cooldowns (
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      action     TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      PRIMARY KEY (guild_id, user_id, action)
    );
  `);
}

export async function ensureUser(guildId, userId, db = pool) {
  await db.query(
    'INSERT INTO users (guild_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [guildId, userId],
  );
}
