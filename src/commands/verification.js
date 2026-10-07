import { Events } from '@fluxerjs/core';
import { pool } from '../db.js';
import { requirePerm, MANAGE, extractId, getGuild, getChannel } from '../util.js';

const VERIFY_EMOJI = '✅';
const MEMBER_ROLE_NAME = 'Member';

// Panels are saved in the database so they keep working after a restart.
// The table is created here, so db.js needs no change.
let tableReady;
function ensureTable() {
  tableReady ??= pool
    .query(
      `CREATE TABLE IF NOT EXISTS verification_panels (
         message_id TEXT PRIMARY KEY,
         guild_id   TEXT NOT NULL,
         role_id    TEXT NOT NULL
       )`,
    )
    .catch((err) => {
      tableReady = undefined;
      throw err;
    });
  return tableReady;
}

function findMemberRole(guild) {
  if (!guild?.roles) return null;

  for (const role of guild.roles.values()) {
    if (role.name === MEMBER_ROLE_NAME) return role;
  }

  return null;
}

// Call once from index.js: registerVerificationEvents(client)
export function registerVerificationEvents(client) {
  ensureTable().catch((err) => console.error('verification: could not create table:', err));

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (user?.bot) return;
      if (reaction.emoji?.name !== VERIFY_EMOJI) return;

      const messageId = reaction.message?.id ?? reaction.messageId;
      if (!messageId) {
        console.error('verification: reaction has no message id. Keys:', Object.keys(reaction ?? {}));
        return;
      }

      await ensureTable();
      const { rows } = await pool.query(
        'SELECT guild_id, role_id FROM verification_panels WHERE message_id = $1',
        [messageId],
      );
      if (!rows.length) return; // not a verification panel

      const { guild_id: guildId, role_id: roleId } = rows[0];
      const guild = client.guilds.get(guildId) ?? (await client.guilds.resolve(guildId));
      const member = guild.members.get(user.id) ?? (await guild.fetchMember(user.id));

      await member.roles.add(roleId);
      console.log(`verification: gave role ${roleId} to ${user.id}`);
    } catch (err) {
      console.error('verification error:', err);
    }
  });
}

export default [
  {
    name: 'verify',
    category: 'moderation',
    description: 'Post the verification panel: verify [@role] (defaults to the "Member" role)',
    guildOnly: true,

    run: async ({ message, args }) => {
      if (!(await requirePerm(message, MANAGE))) return;

      const guild = await getGuild(message);
      if (!guild) return message.reply('This command can only be used in a server.');

      let roleId;
      let roleName;

      const givenId = extractId(args[0]);
      if (givenId) {
        try {
          roleName = (await guild.fetchRole(givenId)).name;
          roleId = givenId;
        } catch {
          return message.reply("I couldn't find that role in this server.");
        }
      } else {
        const memberRole = findMemberRole(guild);
        if (!memberRole) {
          return message.reply(
            `I couldn't find a role named \`${MEMBER_ROLE_NAME}\`. Create one, or use \`verify @role\`.`,
          );
        }
        roleId = memberRole.id;
        roleName = memberRole.name;
      }

      const panel =
        '**🔐 Server Verification**\n\n' +
        'Welcome to the server!\n\n' +
        `React with ${VERIFY_EMOJI} below to verify yourself and receive the **${roleName}** role.`;

      const channel = await getChannel(message);
      const sent = await channel.send(panel);

      await ensureTable();
      await pool.query(
        `INSERT INTO verification_panels (message_id, guild_id, role_id)
         VALUES ($1, $2, $3)
         ON CONFLICT (message_id) DO UPDATE SET role_id = EXCLUDED.role_id`,
        [sent.id, guild.id, roleId],
      );

      await sent.react(VERIFY_EMOJI);

      return message.reply('Verification panel posted.');
    },
  },
];
