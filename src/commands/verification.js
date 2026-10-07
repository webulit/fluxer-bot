import { requirePerm, MANAGE } from '../util.js';

export default [
  {
    name: 'verify',
    description: 'Inspect the Fluxer guild role API',
    guildOnly: true,

    run: async ({ message }) => {
      if (!(await requirePerm(message, MANAGE))) return;

      const guild = message.guild;

      if (!guild) {
        return message.reply(
          'This command can only be used in a server.',
        );
      }

      console.log('GUILD ROLE DEBUG');
      console.log(
        'guild.roles:',
        guild.roles,
      );
      console.log(
        'guild.roles keys:',
        guild.roles
          ? Object.keys(guild.roles)
          : 'undefined',
      );
      console.log(
        'guild keys:',
        Object.keys(guild),
      );

      await message.reply(
        'Role API diagnostic sent to Railway logs.',
      );
    },
  },
];
