import { PermissionFlags } from '@fluxerjs/core';

// "Manage Community" permission (falls back to Administrator if the flag name differs).
export const MANAGE = PermissionFlags.ManageGuild ?? PermissionFlags.Administrator;

export async function getGuild(message) {
  return message.guild ?? (await message.client.guilds.resolve(message.guildId));
}

export async function getChannel(message) {
  return message.channel ?? (await message.resolveChannel());
}

// Pulls a snowflake out of a mention like <#123>, <@&123> or a raw ID.
export const extractId = (s) => s?.match(/\d{15,}/)?.[0] ?? null;

// True if the message author has the flag (or Administrator).
export async function hasPerm(message, flag) {
  const guild = await getGuild(message);
  if (!guild) return false;
  const member =
    guild.members.get(message.author.id) ??
    (await guild.fetchMember(message.author.id).catch(() => null));
  const perms = member?.permissions;
  return !!perms && (perms.has(flag) || perms.has(PermissionFlags.Administrator));
}

// Replies with a refusal and returns false when the author lacks the flag.
export async function requirePerm(message, flag) {
  if (await hasPerm(message, flag)) return true;
  await message.reply("You don't have permission to do that.");
  return false;
}
