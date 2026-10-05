import { PermissionFlags, parseUserMention } from '@fluxerjs/core';
import { getChannel, requirePerm } from '../util.js';
import { pool } from '../db.js';

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
      const { rowCount } = await pool.query('DELETE FROM warnings WHERE id=$1 AND guild_id=$2', [id, message.guildId]);
      await message.reply(rowCount ? `Removed warning **#${id}**.` : 'No warning with that id here.');
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
      const { rowCount } = await pool.query('DELETE FROM warnings WHERE guild_id=$1 AND user_id=$2', [message.guildId, userId]);
      await message.reply(`Cleared **${rowCount}** warnings for <@${userId}>.`);
    },
  },
];
