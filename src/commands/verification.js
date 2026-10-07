import { Events } from '@fluxerjs/core';
import { requirePerm, MANAGE } from '../util.js';

const VERIFY_EMOJI = '✅';
const MEMBER_ROLE_NAME = 'Member';

function findMemberRole(guild) {
  if (!guild?.roles) {
    return null;
  }

  for (const role of guild.roles.values()) {
    if (role.name === MEMBER_ROLE_NAME) {
      return role;
    }
  }

  return null;
}

export function registerVerificationEvents(client) {
  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      if (user?.bot) return;

      const message = reaction?.message;

      if (!message) return;

      const emoji =
        reaction.emoji?.name ??
        reaction.emoji ??
        '';

      if (emoji !== VERIFY_EMOJI) return;

      const guildId =
        message.guildId ??
        message.guild?.id;

      if (!guildId) return;

      const guild =
        message.guild ??
        client.guilds.get(guildId);

      if (!guild) return;

      const memberRole = findMemberRole(guild);

      if (!memberRole) {
        console.error(
          `Verification role "${MEMBER_ROLE_NAME}" was not found.`,
        );

        return;
      }

      const userId =
        user.id ??
        user.user?.id;

      if (!userId) return;

      const member = await guild.members.fetch(userId);

      if (!member) return;

      await member.roles.add(memberRole.id);

      console.log(
        `Verified ${user.username ?? userId} in ${guildId}`,
      );
    } catch (err) {
      console.error(
        'Verification reaction error:',
        err,
      );
    }
  });
}

export default [
  {
    name: 'verify',
    description: 'Post the server verification panel',
    guildOnly: true,

    run: async ({ message }) => {
      if (!(await requirePerm(message, MANAGE))) return;

      const guild = message.guild;

      if (!guild) {
        return message.reply(
          'This command can only be used in a server.',
        );
      }

      const memberRole = findMemberRole(guild);

      if (!memberRole) {
        return message.reply(
          `I couldn't find the \`${MEMBER_ROLE_NAME}\` role.`,
        );
      }

      const panel =
        '**🔐 Server Verification**\n\n' +
        'Welcome to the server!\n\n' +
        `React with ${VERIFY_EMOJI} below to verify yourself and receive the **${MEMBER_ROLE_NAME}** role.`;

      const sent = await message.channel.send(panel);

      await sent.react(VERIFY_EMOJI);

      return message.reply(
        'Verification panel posted.',
      );
    },
  },
];
