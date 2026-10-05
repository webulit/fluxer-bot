export default [
  {
    name: 'ping',
    description: 'Check if the bot is alive',
    run: ({ message }) => message.reply('Pong!'),
  },
  {
    name: 'help',
    description: 'List all commands',
    run: ({ message, prefix, commands }) => {
      const lines = commands.map((c) => `\`${prefix}${c.name}\` - ${c.description}`);
      return message.reply(`**Commands**\n${lines.join('\n')}`);
    },
  },
];
