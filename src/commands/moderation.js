import { PermissionFlags, parseUserMention } from '@fluxerjs/core';
import { getGuild, hasPerm } from '../util.js';
import { pool } from '../db.js';

async function allowed(message, flag) {
  if (await hasPerm(message, flag)) return true;
  await message.reply("You don't have permission to do that.");
  return false;
}

export default [
  {
    name: 'kick',
    description: 'Kick a member: kick @user',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.KickMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      if (!userId) return message.reply('Usage: `kick @user`');
      const guild = await getGuild(message);
      try {
        await guild.kick(userId);
        await message.reply(`Kicked <@${userId}>.`);
      } catch {
        await message.reply("I couldn't kick that user (check my permissions and role position).");
      }
    },
  },
  {
    name: 'ban',
    description: 'Ban a member: ban @user [reason]',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.BanMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      if (!userId) return message.reply('Usage: `ban @user [reason]`');
      const guild = await getGuild(message);
      try {
        await guild.ban(userId, { reason: args.slice(1).join(' ') || undefined, deleteMessageDays: 0 });
        await message.reply(`Banned <@${userId}>.`);
      } catch {
        await message.reply("I couldn't ban that user (check my permissions and role position).");
      }
    },
  },
  {
    name: 'unban',
    description: 'Unban a user: unban <user id>',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.BanMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      if (!userId) return message.reply('Usage: `unban <user id>`');
      const guild = await getGuild(message);
      try {
        await guild.unban(userId);
        await message.reply(`Unbanned <@${userId}>.`);
      } catch {
        await message.reply("I couldn't unban that user.");
      }
    },
  },
  {
    name: 'warn',
    description: 'Warn a member: warn @user reason',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.ModerateMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      const reason = args.slice(1).join(' ');
      if (!userId || !reason) return message.reply('Usage: `warn @user reason`');
      await pool.query(
        'INSERT INTO warnings (guild_id, user_id, mod_id, reason) VALUES ($1,$2,$3,$4)',
        [message.guildId, userId, message.author.id, reason],
      );
      await message.reply(`Warned <@${userId}>: ${reason}`);
    },
  },
  {
    name: 'warnings',
    description: 'View a member\'s warnings: warnings @user',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.ModerateMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      if (!userId) return message.reply('Usage: `warnings @user`');
      const { rows } = await pool.query(
        'SELECT id, mod_id, reason, created_at FROM warnings WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 10',
        [message.guildId, userId],
      );
      if (!rows.length) return message.reply(`<@${userId}> has no warnings.`);
      const lines = rows.map(
        (w) => `#${w.id} - ${w.reason} (by <@${w.mod_id}>, ${w.created_at.toISOString().slice(0, 10)})`,
      );
      await message.reply(`**Warnings for <@${userId}>**\n${lines.join('\n')}`);
    },
  },
];
