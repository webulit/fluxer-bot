import { pool } from '../db.js';

const cooldowns = new Map();
const XP_COOLDOWN_MS = 60_000;

export const levelFromXp = (xp) => Math.floor(Math.sqrt(xp / 100));

// Called for every non-command message in a server.
export async function awardXp(message) {
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) ?? 0) < XP_COOLDOWN_MS) return;
  cooldowns.set(key, now);

  const gain = 15 + Math.floor(Math.random() * 11);
  const { rows } = await pool.query(
    `INSERT INTO users (guild_id, user_id, xp) VALUES ($1, $2, $3)
     ON CONFLICT (guild_id, user_id) DO UPDATE SET xp = users.xp + $3
     RETURNING xp, level`,
    [message.guildId, message.author.id, gain],
  );
  const newLevel = levelFromXp(rows[0].xp);
  if (newLevel > rows[0].level) {
    await pool.query('UPDATE users SET level=$3 WHERE guild_id=$1 AND user_id=$2', [
      message.guildId,
      message.author.id,
      newLevel,
    ]);
    await message.reply(`<@${message.author.id}> reached level **${newLevel}**!`);
  }
}

export default [
  {
    name: 'rank',
    description: 'Show your level and XP',
    guildOnly: true,
    run: async ({ message }) => {
      const { rows } = await pool.query(
        'SELECT xp, level FROM users WHERE guild_id=$1 AND user_id=$2',
        [message.guildId, message.author.id],
      );
      if (!rows.length) return message.reply('No XP yet. Start chatting!');
      const pos = await pool.query(
        'SELECT COUNT(*) + 1 AS pos FROM users WHERE guild_id=$1 AND xp > $2',
        [message.guildId, rows[0].xp],
      );
      await message.reply(
        `Level **${rows[0].level}** - **${rows[0].xp}** XP - rank **#${pos.rows[0].pos}**`,
      );
    },
  },
  {
    name: 'levels',
    aliases: ['xptop'],
    description: 'Top 10 by XP',
    guildOnly: true,
    run: async ({ message }) => {
      const { rows } = await pool.query(
        'SELECT user_id, xp, level FROM users WHERE guild_id=$1 AND xp > 0 ORDER BY xp DESC LIMIT 10',
        [message.guildId],
      );
      if (!rows.length) return message.reply('Nobody has XP yet.');
      const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> - level ${r.level} (${r.xp} XP)`);
      await message.reply(`**XP leaderboard**\n${lines.join('\n')}`);
    },
  },
];
