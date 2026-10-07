import { PermissionFlags, parseUserMention } from '@fluxerjs/core';
import { getChannel, requirePerm } from '../util.js';
import { pool } from '../db.js';

async function logAction(message, action, targetId = null, reason = null) {
  await pool.query(
    'INSERT INTO moderation_logs (guild_id, action, target_id, moderator_id, reason) VALUES ($1,$2,$3,$4,$5)',
    [message.guildId, action, targetId, message.author.id, reason],
  );
}

export default [
  {
    name: 'purge',
    aliases: ['clear'],
    description: 'Bulk delete recent messages: purge <1-99>',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, PermissionFlags.ManageMessages))) return;
      const n = Number.parseInt(args[0], 10);
      if (!Number.isInteger(n) || n < 1 || n > 99) return message.reply('Usage: `purge <1-99>`');
      const channel = await getChannel(message);
      try {
        await channel.bulkDelete(n + 1); // +1 also removes the command message
      } catch (err) {
        console.error('purge failed:', err);
        return message.reply("I couldn't delete those (I need Manage Messages, and old messages can't be bulk deleted).");
      }
      await logAction(message, 'clear', null, `Deleted ${n} messages`);
      const note = await channel.send(`Deleted **${n}** messages.`);
      setTimeout(() => note?.delete?.().catch(() => {}), 4000);
    },
  },
  {
    name: 'delwarn',
    description: 'Remove one warning: delwarn <warning id>',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, PermissionFlags.ModerateMembers))) return;
      const id = Number.parseInt(args[0], 10);
      if (!Number.isInteger(id)) return message.reply('Usage: `delwarn <warning id>`');
      const { rows } = await pool.query('SELECT user_id, reason FROM warnings WHERE id=$1 AND guild_id=$2', [id, message.guildId]);
      if (!rows.length) return message.reply('No warning with that id here.');
      await pool.query('DELETE FROM warnings WHERE id=$1 AND guild_id=$2', [id, message.guildId]);
      await logAction(message, 'delwarn', rows[0].user_id, rows[0].reason || `Removed warning #${id}`);
      await message.reply(`Removed warning **#${id}**.`);
    },
  },
  {
    name: 'clearwarnings',
    description: "Remove all of a member's warnings: clearwarnings @user",
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, PermissionFlags.ModerateMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      if (!userId) return message.reply('Usage: `clearwarnings @user`');
      const { rows } = await pool.query('SELECT reason FROM warnings WHERE guild_id=$1 AND user_id=$2', [message.guildId, userId]);
      await pool.query('DELETE FROM warnings WHERE guild_id=$1 AND user_id=$2', [message.guildId, userId]);
      await logAction(message, 'clearwarnings', userId, `Cleared ${rows.length} warnings`);
      await message.reply(`Cleared **${rows.length}** warnings for <@${userId}>.`);
    },
  },
];
