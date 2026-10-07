```js
import { requirePerm, MANAGE } from '../util.js';

const VERIFY_EMOJI = '✅';
const MEMBER_ROLE_NAME = 'Member';

export default [
  {
    name: 'verify',
    description: 'Post the server verification panel',
    guildOnly: true,

    run: async ({ message }) => {
      if (!(await requirePerm(message, MANAGE))) return;

      const guild = message.guild;

      if (!guild) {
        return message.reply('This command can only be used in a server.');
      }

      const roles = await guild.roles.fetch();
      const memberRole = roles.find(
        (role) => role.name === MEMBER_ROLE_NAME,
      );

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

      return message.reply('Verification panel posted.');
    },
  },
];
```
