export default [
  {
    name: 'ping',
    description: 'Check if the bot is alive',
    run: ({ message }) => message.reply('Pong!'),
  },
  {
    name: 'help',
    description: 'Show categories: help [category]',
    run: ({ message, args, prefix, commands }) => {
      const groups = new Map();
      for (const c of commands) {
        const key = c.category ?? 'other';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      }
      const want = args[0]?.toLowerCase();
      if (want && groups.has(want)) {
        const lines = groups.get(want).map((c) => `\`${prefix}${c.name}\` - ${c.description}`);
        return message.reply(`**${want}**\n${lines.join('\n')}`);
      }
      const cats = [...groups].map(([k, v]) => `\`${prefix}help ${k}\` - ${v.length} commands`);
      return message.reply(`**Help categories**\n${cats.join('\n')}`);
    },
  },
];
