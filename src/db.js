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



    CREATE TABLE IF NOT EXISTS birthdays (
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      month INTEGER NOT NULL,
      day INTEGER NOT NULL,
      PRIMARY KEY (guild_id, user_id)
    );
    CREATE TABLE IF NOT EXISTS user_notes (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      moderator_id TEXT NOT NULL,
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      prize TEXT NOT NULL,
      winners INTEGER NOT NULL DEFAULT 1,
      ends_at TIMESTAMPTZ NOT NULL,
      ended BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS tickets (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      channel_id TEXT,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'normal',
      claimed_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS birthday_settings (
      guild_id TEXT PRIMARY KEY,
      channel_id TEXT
    );
    CREATE TABLE IF NOT EXISTS guild_command_settings (
      guild_id TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS reaction_roles (
      guild_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      role_id TEXT NOT NULL,
      PRIMARY KEY (guild_id, message_id, emoji)
    );
    CREATE TABLE IF NOT EXISTS applications (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      guild_id TEXT NOT NULL,
      reporter_id TEXT NOT NULL,
      target_id TEXT,
      reason TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(guild_id, month, day);
    CREATE INDEX IF NOT EXISTS idx_user_notes_target ON user_notes(guild_id, user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_giveaways_active ON giveaways(guild_id, ended, ends_at);
    CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);

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
