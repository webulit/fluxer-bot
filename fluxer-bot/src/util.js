import { PermissionFlags } from '@fluxerjs/core';

export async function getGuild(message) {
  return message.guild ?? (await message.client.guilds.resolve(message.guildId));
}

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
