import { PermissionFlags, parseUserMention } from '@fluxerjs/core';
import { getGuild, hasPerm } from '../util.js';
import { pool } from '../db.js';

async function logAction(message, action, targetId, reason = null) {
  await pool.query(
    'INSERT INTO moderation_logs (guild_id, action, target_id, moderator_id, reason) VALUES ($1,$2,$3,$4,$5)',
    [message.guildId, action, targetId, message.author.id, reason],
  );
}

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
        await logAction(message, 'kick', userId, args.slice(1).join(' ') || 'No reason provided');
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
        await logAction(message, 'ban', userId, args.slice(1).join(' ') || 'No reason provided');
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
        await logAction(message, 'unban', userId);
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
      await logAction(message, 'warn', userId, reason);
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

  {
    name: 'timeout',
    description: 'Temporarily timeout a member: timeout @user 10m [reason]',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.ModerateMembers))) return;
      const userId = parseUserMention(args[0] ?? '');
      const match = String(args[1] ?? '').match(/^(\d+)(s|m|h|d)$/i);
      if (!userId || !match) return message.reply('Usage: `timeout @user <10s|10m|1h|1d> [reason]`');
      const value = Number(match[1]);
      const multiplier = { s: 1, m: 60, h: 3600, d: 86400 }[match[2].toLowerCase()];
      const seconds = value * multiplier;
      if (!Number.isFinite(seconds) || seconds < 1 || seconds > 28 * 86400) {
        return message.reply('Timeout must be between 1 second and 28 days.');
      }
      const reason = args.slice(2).join(' ') || 'No reason provided';
      const guild = await getGuild(message);
      const member = guild.members?.get?.(userId) ?? await guild.fetchMember?.(userId).catch(() => null);
      if (!member) return message.reply('I could not find that member.');
      try {
        await member.edit({
          communication_disabled_until: new Date(Date.now() + seconds * 1000).toISOString(),
          timeout_reason: reason,
        });
        await logAction(message, 'timeout', userId, reason);
        await message.reply(`Timed out <@${userId}> for **${args[1]}**.`);
      } catch (err) {
        console.error('timeout failed:', err);
        await message.reply("I couldn't timeout that user (check my permissions and role position).");
      }
    },
  },

  {
    name: 'modlogs',
    description: 'View recent moderation logs: modlogs [@user]',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await allowed(message, PermissionFlags.ModerateMembers))) return;
      const userId = args[0] ? parseUserMention(args[0]) : null;
      if (args[0] && !userId) return message.reply('Usage: `modlogs [@user]`');
      const query = userId
        ? 'SELECT id, action, target_id, moderator_id, reason, created_at FROM moderation_logs WHERE guild_id=$1 AND target_id=$2 ORDER BY id DESC LIMIT 20'
        : 'SELECT id, action, target_id, moderator_id, reason, created_at FROM moderation_logs WHERE guild_id=$1 ORDER BY id DESC LIMIT 20';
      const params = userId ? [message.guildId, userId] : [message.guildId];
      const { rows } = await pool.query(query, params);
      if (!rows.length) return message.reply(userId ? `No moderation logs for <@${userId}>.` : 'No moderation logs yet.');
      const lines = rows.map((r) =>
        `#${r.id} **${r.action}** <@${r.target_id}> — ${r.reason || 'No reason'} (by <@${r.moderator_id}>, ${new Date(r.created_at).toISOString().slice(0, 10)})`,
      );
      await message.reply(`**Moderation Logs${userId ? ` for <@${userId}>` : ''}**\n${lines.join('\n')}`);
    },
  },
];
