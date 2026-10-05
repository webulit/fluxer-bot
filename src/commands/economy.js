import { parseUserMention } from '@fluxerjs/core';
import { pool, ensureUser } from '../db.js';

const DAILY_AMOUNT = 250;

export default [
  {
    name: 'balance',
    aliases: ['bal'],
    description: 'Check coins: balance [@user]',
    guildOnly: true,
    run: async ({ message, args }) => {
      const id = args[0] ? parseUserMention(args[0]) : message.author.id;
      if (!id) return message.reply('Mention a valid user.');
      await ensureUser(message.guildId, id);
      const { rows } = await pool.query(
        'SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2',
        [message.guildId, id],
      );
      await message.reply(`<@${id}> has **${rows[0].balance}** coins.`);
    },
  },
  {
    name: 'daily',
    description: `Claim ${DAILY_AMOUNT} coins every 24 hours`,
    guildOnly: true,
    run: async ({ message }) => {
      const { guildId } = message;
      const userId = message.author.id;
      await ensureUser(guildId, userId);
      const { rows } = await pool.query(
        `UPDATE users SET balance = balance + $3, last_daily = now()
         WHERE guild_id=$1 AND user_id=$2
           AND (last_daily IS NULL OR last_daily < now() - interval '24 hours')
         RETURNING balance`,
        [guildId, userId, DAILY_AMOUNT],
      );
      if (rows.length) {
        return message.reply(`You claimed **${DAILY_AMOUNT}** coins. Balance: **${rows[0].balance}**.`);
      }
      const wait = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (last_daily + interval '24 hours' - now())) AS secs
         FROM users WHERE guild_id=$1 AND user_id=$2`,
        [guildId, userId],
      );
      const secs = Math.ceil(Number(wait.rows[0].secs));
      await message.reply(`Come back in **${Math.floor(secs / 3600)}h ${Math.floor((secs % 3600) / 60)}m**.`);
    },
  },
  {
    name: 'pay',
    description: 'Send coins: pay @user amount',
    guildOnly: true,
    run: async ({ message, args }) => {
      const toId = parseUserMention(args[0] ?? '');
      const amount = Number.parseInt(args[1], 10);
      if (!toId || !Number.isInteger(amount) || amount <= 0) {
        return message.reply('Usage: `pay @user amount`');
      }
      if (toId === message.author.id) return message.reply("You can't pay yourself.");

      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await ensureUser(message.guildId, message.author.id, db);
        await ensureUser(message.guildId, toId, db);
        const taken = await db.query(
          'UPDATE users SET balance = balance - $3 WHERE guild_id=$1 AND user_id=$2 AND balance >= $3',
          [message.guildId, message.author.id, amount],
        );
        if (!taken.rowCount) {
          await db.query('ROLLBACK');
          return message.reply("You don't have enough coins.");
        }
        await db.query(
          'UPDATE users SET balance = balance + $3 WHERE guild_id=$1 AND user_id=$2',
          [message.guildId, toId, amount],
        );
        await db.query('COMMIT');
        await message.reply(`Sent **${amount}** coins to <@${toId}>.`);
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        db.release();
      }
    },
  },
  {
    name: 'richest',
    aliases: ['baltop'],
    description: 'Top 10 coin balances',
    guildOnly: true,
    run: async ({ message }) => {
      const { rows } = await pool.query(
        'SELECT user_id, balance FROM users WHERE guild_id=$1 AND balance > 0 ORDER BY balance DESC LIMIT 10',
        [message.guildId],
      );
      if (!rows.length) return message.reply('Nobody has any coins yet.');
      const lines = rows.map((r, i) => `${i + 1}. <@${r.user_id}> - ${r.balance}`);
      await message.reply(`**Richest members**\n${lines.join('\n')}`);
    },
  },
];
