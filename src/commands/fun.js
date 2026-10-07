const pick = (arr) => arr[Math.floor(Math.random() * arr.length)  {
    name: 'coinflip',
    aliases: ['cf'],
    description: 'Flip a coin: coinflip',
    run: ({ message }) =>
      message.reply(Math.random() < 0.5 ? '🪙 Heads!' : '🪙 Tails!'),
  },
];

const BALL = [
  'It is certain.', 'Without a doubt.', 'Yes, definitely.', 'Most likely.', 'Signs point to yes.',
  'Ask again later.', 'Cannot predict now.', "Don't count on it.", 'My sources say no.', 'Very doubtful.',
];

export default [
  {
    name: '8ball',
    description: 'Ask the magic 8-ball: 8ball <question>',
    run: ({ message, args }) =>
      args.length ? message.reply(`🎱 ${pick(BALL)}`) : message.reply('Ask me a question first.'),
  },
  {
    name: 'roll',
    description: 'Roll dice: roll [NdM], e.g. roll 2d6',
    run: ({ message, args }) => {
      const m = (args[0] ?? '1d6').toLowerCase().match(/^(\d{1,2})d(\d{1,4})$/);
      if (!m) return message.reply('Usage: `roll 2d6`');
      const count = Number(m[1]);
      const sides = Number(m[2]);
      if (count < 1 || count > 20 || sides < 2) return message.reply('Use 1-20 dice with at least 2 sides.');
      const rolls = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * sides));
      const total = rolls.reduce((a, b) => a + b, 0);
      return message.reply(`🎲 ${rolls.join(', ')} (total **${total}**)`);
    },
  },
  {
    name: 'choose',
    description: 'Pick one option: choose pizza, tacos, sushi',
    run: ({ message, args }) => {
      const options = args.join(' ').split(',').map((s) => s.trim()).filter(Boolean);
      if (options.length < 2) return message.reply('Give me at least two options separated by commas.');
      return message.reply(`I choose: **${pick(options)}**`);
    },
  },
];
