import { pool, ensureUser } from '../db.js';

const MAX_BET = 5000;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function parseBet(raw) {
  const bet = Number.parseInt(raw, 10);
  return Number.isInteger(bet) && bet > 0 && bet <= MAX_BET ? bet : null;
}

// Takes the bet up front; returns false if the user can't afford it.
async function takeBet(guildId, userId, bet) {
  await ensureUser(guildId, userId);
  const { rowCount } = await pool.query(
    'UPDATE users SET balance = balance - $3 WHERE guild_id=$1 AND user_id=$2 AND balance >= $3',
    [guildId, userId, bet],
  );
  return rowCount > 0;
}

async function pay(guildId, userId, amount) {
  const { rows } = await pool.query(
    'UPDATE users SET balance = balance + $3 WHERE guild_id=$1 AND user_id=$2 RETURNING balance',
    [guildId, userId, amount],
  );
  return rows[0].balance;
}

const SYMBOLS = ['🍒', '🍋', '🔔', '⭐', '💎'];

export default [
  {
    name: 'coinflip',
    aliases: ['cf'],
    description: `Bet on a flip: coinflip <heads|tails> <bet> (max ${MAX_BET})`,
    guildOnly: true,
    run: async ({ message, args }) => {
      const side = args[0]?.toLowerCase();
      const bet = parseBet(args[1]);
      if (!['heads', 'tails'].includes(side) || !bet) return message.reply(`Usage: \`coinflip <heads|tails> <bet up to ${MAX_BET}>\``);
      if (!(await takeBet(message.guildId, message.author.id, bet))) return message.reply("You don't have enough coins.");
      const result = pick(['heads', 'tails']);
      if (result === side) {
        const bal = await pay(message.guildId, message.author.id, bet * 2);
        return message.reply(`It landed **${result}**. You won **${bet}** coins! Balance: **${bal}**.`);
      }
      const bal = (await pool.query('SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2', [message.guildId, message.author.id])).rows[0].balance;
      await message.reply(`It landed **${result}**. You lost **${bet}** coins. Balance: **${bal}**.`);
    },
  },
  {
    name: 'slots',
    description: `Spin the slots: slots <bet> (max ${MAX_BET})`,
    guildOnly: true,
    run: async ({ message, args }) => {
      const bet = parseBet(args[0]);
      if (!bet) return message.reply(`Usage: \`slots <bet up to ${MAX_BET}>\``);
      if (!(await takeBet(message.guildId, message.author.id, bet))) return message.reply("You don't have enough coins.");
      const reels = [pick(SYMBOLS), pick(SYMBOLS), pick(SYMBOLS)];
      const unique = new Set(reels).size;
      let payout = 0;
      let text = 'No match.';
      if (unique === 1) { payout = bet * 10; text = `JACKPOT! You won **${bet * 9}** coins!`; }
      else if (unique === 2) { payout = bet; text = 'Two of a kind. You get your bet back.'; }
      const bal = payout
        ? await pay(message.guildId, message.author.id, payout)
        : (await pool.query('SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2', [message.guildId, message.author.id])).rows[0].balance;
      await message.reply(`${reels.join(' | ')}\n${text} Balance: **${bal}**.`);
    },
  },
  {
    name: 'dice',
    description: `Roll against the bot: dice <bet> (max ${MAX_BET})`,
    guildOnly: true,
    run: async ({ message, args }) => {
      const bet = parseBet(args[0]);
      if (!bet) return message.reply(`Usage: \`dice <bet up to ${MAX_BET}>\``);
      if (!(await takeBet(message.guildId, message.author.id, bet))) return message.reply("You don't have enough coins.");
      const you = 1 + Math.floor(Math.random() * 6);
      const bot = 1 + Math.floor(Math.random() * 6);
      let payout = 0;
      let text = 'You lose.';
      if (you > bot) { payout = bet * 2; text = `You win **${bet}** coins!`; }
      else if (you === bot) { payout = bet; text = "It's a tie. Bet returned."; }
      const bal = payout
        ? await pay(message.guildId, message.author.id, payout)
        : (await pool.query('SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2', [message.guildId, message.author.id])).rows[0].balance;
      await message.reply(`You rolled **${you}**, I rolled **${bot}**. ${text} Balance: **${bal}**.`);
    },
  },
];
