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
      const categoryFor = (command) => {
        if (command.category) return command.category.toLowerCase();

        const name = command.name.toLowerCase();
        const categories = {
          moderation: ['warn', 'warnings', 'timeout', 'untimeout', 'kick', 'ban', 'unban', 'clear', 'purge', 'delwarn', 'clearwarnings', 'modlogs', 'cases', 'massban', 'masskick', 'lock', 'unlock', 'say', 'dm', 'usernotes'],
          tickets: ['ticket', 'claim', 'close', 'priority'],
          economy: ['balance', 'bal', 'daily', 'pay', 'richest', 'baltop', 'beg', 'crime', 'fish', 'mine', 'work', 'slut', 'gamble', 'rob', 'deposit', 'withdraw', 'economy', 'eleaderboard', 'shop', 'buy', 'sell'],
          fun: ['8ball', 'roll', 'choose', 'coinflip', 'cf', 'count', 'fight', 'flip'],
          giveaways: ['gcreate', 'gdelete', 'gend', 'greroll'],
          leveling: ['leaderboard', 'level', 'leveladd', 'levelremove', 'levelset'],
          utility: ['ping', 'help', 'commands', 'stats', 'support', 'uptime', 'avatar', 'userinfo', 'serverinfo', 'firstmsg', 'report', 'baseconvert', 'calculate', 'generatepassword', 'hexcolor', 'poll', 'randomuser', 'shorten', 'time', 'unixtime', 'countdown', 'embedbuilder', 'weather', 'search'],
          birthday: ['birthday'],
          community: ['greet', 'goodbye', 'logging', 'serverstats', 'jointocreate', 'autoverify', 'verification', 'shop-config', 'reactroles', 'selfroles', 'autorole', 'welcome', 'setwelcome', 'welcomemsg', 'setgoodbye', 'goodbyemsg'],
          games: ['games'],
          music: ['join', 'play', 'queue', 'nowplaying', 'music'],
          todo: ['todo'],
          core: ['configwizard', 'app-admin', 'apply', 'announce', 'status', 'reload', 'rules', 'server', 'info'],
        };

        for (const [category, names] of Object.entries(categories)) {
          if (names.includes(name)) return category;
        }
        return 'other';
      };

      const groups = new Map();
      for (const c of commands) {
        const key = categoryFor(c);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(c);
      }

      const want = args[0]?.toLowerCase();

      if (want) {
        const list = groups.get(want);
        if (!list) {
          return message.reply(
            'Unknown help category **' + want + '**. Use ' + prefix + 'help to see the available categories.'
          );
        }

        const lines = list
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((c) => prefix + c.name + ' - ' + (c.description ?? 'No description available.'));

        return message.reply('**' + want + ' commands**\\n' + lines.join('\n'));
      }

      const cats = [...groups.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([category, list]) => prefix + 'help ' + category + ' - ' + list.length + ' commands');

      return message.reply(
        '**Help categories**\\n\\n' + cats.join('\n') + '\\n\\nUse ' + prefix + 'help <category> to view a category.'
      );
    },
  },
];
