// src/commands/autorole.js
//
// Usage (needs Manage Roles):
//   !autorole add @Role      add a role that new members get on join
//   !autorole remove @Role   stop giving that role
//   !autorole list           show the current autoroles
//
// Typing "@" in the message box should suggest your roles, the same way
// the role picker works in a Discord slash command.

import { Events, PermissionFlags } from '@fluxerjs/core';
// Adjust this import to whatever your db.js exports (needs .query).
import { pool } from '../db.js';

const ROLE_MENTION = /^<@&(\d+)>$/;
const RAW_ID = /^\d{5,}$/;

function parseRoleId(arg) {
  if (!arg) return null;
  const mention = arg.match(ROLE_MENTION);
  if (mention) return mention[1];
  return RAW_ID.test(arg) ? arg : null;
}

async function getAutoroleIds(guildId) {
  const { rows } = await pool.query(
    'SELECT role_id FROM autoroles WHERE guild_id = $1',
    [guildId],
  );
  return rows.map((r) => r.role_id);
}

// Call once from index.js: registerAutoroleEvents(client)
export function registerAutoroleEvents(client) {
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const roleIds = await getAutoroleIds(member.guild.id);

      for (const roleId of roleIds) {
        try {
          await member.roles.add(roleId);
        } catch (err) {
          console.error(`autorole: could not add ${roleId}:`, err.message);
        }
      }
    } catch (err) {
      console.error('autorole: join handler failed:', err);
    }
  });
}

export default {
  name: 'autorole',
  aliases: ['autoroles'],
  guildOnly: true,

  async run({ message, args, prefix }) {
    const guild = await message.resolveGuild();
    if (!guild) return;

    const member =
      guild.members.get(message.author.id) ??
      (await guild.fetchMember(message.author.id));

    if (!member?.permissions.has(PermissionFlags.ManageRoles)) {
      await message.reply('You need the Manage Roles permission to use this.');
      return;
    }

    const sub = args[0]?.toLowerCase();

    if (sub === 'add' || sub === 'remove') {
      const roleId = parseRoleId(args[1]);

      if (!roleId) {
        await message.reply(`Usage: ${prefix}autorole ${sub} @Role`);
        return;
      }

      let role;
      try {
        role = await guild.fetchRole(roleId);
      } catch {
        role = null;
      }

      if (!role) {
        await message.reply("I couldn't find that role in this server.");
        return;
      }

      if (sub === 'add') {
        const me =
          guild.members.me ?? (await guild.members.fetchMe());

        if (!me?.permissions.has(PermissionFlags.ManageRoles)) {
          await message.reply(
            'I need the Manage Roles permission before I can hand out roles.',
          );
          return;
        }

        await pool.query(
          `INSERT INTO autoroles (guild_id, role_id)
           VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [guild.id, roleId],
        );

        await message.reply(
          `New members will now get **${role.name}**. Make sure my highest role is above it in the role list.`,
        );
        return;
      }

      await pool.query(
        'DELETE FROM autoroles WHERE guild_id = $1 AND role_id = $2',
        [guild.id, roleId],
      );

      await message.reply(`**${role.name}** is no longer an autorole.`);
      return;
    }

    if (sub === 'list' || !sub) {
      const roleIds = await getAutoroleIds(guild.id);

      if (roleIds.length === 0) {
        await message.reply(
          `No autoroles set. Add one with ${prefix}autorole add @Role`,
        );
        return;
      }

      await message.reply(
        `Autoroles: ${roleIds.map((id) => `<@&${id}>`).join(', ')}`,
      );
      return;
    }

    await message.reply(
      `Usage: ${prefix}autorole add @Role | remove @Role | list`,
    );
  },
};

/*
Add this to the migrate() function in src/db.js:

  CREATE TABLE IF NOT EXISTS autoroles (
    guild_id TEXT NOT NULL,
    role_id  TEXT NOT NULL,
    PRIMARY KEY (guild_id, role_id)
  );
*/
