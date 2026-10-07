// src/commands/economyplus.js
//
// Ported from the Discord bot: beg, crime, fish, mine, gamble, rob, deposit, withdraw.
// Needs the two SQL changes at the bottom of this file in migrate() (src/db.js).
//
// Item bonuses use your shop items, matched by name (not case sensitive):
//   "Fishing Rod" +50% fish, "Pickaxe" +20% mine, "Diamond Pickaxe" +100% mine,
//   "Lucky Clover" +10% gamble (used up), "Lucky Charm" +8% gamble (used up),
//   "Personal Safe" blocks rob, "Bank Note" +10,000 bank space.

import { parseUserMention } from '@fluxerjs/core';
import { pool, ensureUser } from '../db.js';

const BASE_BANK_CAPACITY = 10_000;
const BANK_NOTE_SPACE = 10_000;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmt = (n) => Number(n).toLocaleString('en-US');

function duration(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ---- cooldowns -------------------------------------------------------------

// Starts a cooldown if none is active. Returns 0 on success, otherwise the ms left.
async function claim(guildId, userId, action, ms) {
  const { rowCount } = await pool.query(
    `INSERT INTO cooldowns (guild_id, user_id, action, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4::float8 / 1000))
     ON CONFLICT (guild_id, user_id, action)
     DO UPDATE SET expires_at = EXCLUDED.expires_at
     WHERE cooldowns.expires_at <= now()`,
    [guildId, userId, action, ms],
  );
  if (rowCount) return 0;
  return cooldownLeft(guildId, userId, action);
}

async function cooldownLeft(guildId, userId, action) {
  const { rows } = await pool.query(
    `SELECT EXTRACT(EPOCH FROM (expires_at - now())) * 1000 AS ms
       FROM cooldowns WHERE guild_id=$1 AND user_id=$2 AND action=$3`,
    [guildId, userId, action],
  );
  return rows.length ? Math.max(0, Math.ceil(Number(rows[0].ms))) : 0;
}

async function setCooldown(guildId, userId, action, ms) {
  await pool.query(
    `INSERT INTO cooldowns (guild_id, user_id, action, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4::float8 / 1000))
     ON CONFLICT (guild_id, user_id, action) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
    [guildId, userId, action, ms],
  );
}

// ---- balances and items ----------------------------------------------------

async function getBalance(guildId, userId) {
  await ensureUser(guildId, userId);
  const { rows } = await pool.query(
    'SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2',
    [guildId, userId],
  );
  return Number(rows[0].balance);
}

// Adds (or subtracts, with a negative number) coins. Never goes below 0.
async function addBalance(guildId, userId, delta) {
  await ensureUser(guildId, userId);
  const { rows } = await pool.query(
    `UPDATE users SET balance = GREATEST(0, balance + $3)
      WHERE guild_id=$1 AND user_id=$2 RETURNING balance`,
    [guildId, userId, delta],
  );
  return Number(rows[0].balance);
}

async function itemQty(guildId, userId, name) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(i.qty), 0)::int AS qty
       FROM inventory i JOIN shop_items s ON s.id = i.item_id
      WHERE i.guild_id=$1 AND i.user_id=$2 AND lower(s.name) = lower($3)`,
    [guildId, userId, name],
  );
  return rows[0].qty;
}

async function consumeItem(guildId, userId, name) {
  const { rowCount } = await pool.query(
    `UPDATE inventory SET qty = qty - 1
      WHERE guild_id=$1 AND user_id=$2 AND qty > 0
        AND item_id = (SELECT id FROM shop_items WHERE guild_id=$1 AND lower(name) = lower($3) LIMIT 1)`,
    [guildId, userId, name],
  );
  return rowCount > 0;
}

async function bankCapacity(guildId, userId) {
  return BASE_BANK_CAPACITY + (await itemQty(guildId, userId, 'Bank Note')) * BANK_NOTE_SPACE;
}

// Runs fn(db) in a transaction and returns whatever it returns.
async function tx(fn) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const out = await fn(db);
    await db.query('COMMIT');
    return out;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
}

// ---- flavour text ----------------------------------------------------------

const BEG_WIN = [
  (n) => `A kind stranger drops **${fmt(n)}** coins into your cup.`,
  (n) => `You spotted an unattended wallet! You grab **${fmt(n)}** coins and run.`,
  (n) => `Someone took pity on you and gave you **${fmt(n)}** coins!`,
  (n) => `You found **${fmt(n)}** coins under a park bench.`,
];
const BEG_FAIL = [
  'The police chased you off. You got nothing.',
  "Someone yelled, 'Get a job!' and walked past.",
  'A squirrel stole the single coin you had.',
  'You tried to beg, but you were too embarrassed and gave up.',
];

const CRIMES = [
  { name: 'Pickpocketing', min: 100, max: 500, risk: 0.3 },
  { name: 'Burglary', min: 300, max: 1000, risk: 0.4 },
  { name: 'Bank Heist', min: 1000, max: 5000, risk: 0.6 },
  { name: 'Art Theft', min: 2000, max: 10000, risk: 0.7 },
  { name: 'Cybercrime', min: 5000, max: 20000, risk: 0.8 },
];
const crimeKey = (c) => c.name.toLowerCase().replace(/\s+/g, '-');

const FISH = [
  { name: 'Bass', emoji: '🐟', rarity: 'common' },
  { name: 'Salmon', emoji: '🐟', rarity: 'common' },
  { name: 'Trout', emoji: '🐟', rarity: 'common' },
  { name: 'Tuna', emoji: '🐠', rarity: 'uncommon' },
  { name: 'Swordfish', emoji: '🐠', rarity: 'uncommon' },
  { name: 'Octopus', emoji: '🐙', rarity: 'rare' },
  { name: 'Lobster', emoji: '🦞', rarity: 'rare' },
  { name: 'Shark', emoji: '🦈', rarity: 'epic' },
  { name: 'Whale', emoji: '🐋', rarity: 'legendary' },
];
const byRarity = (r) => FISH.filter((f) => f.rarity === r);
const CATCH_LINES = [
  'You cast your line into the crystal clear waters...',
  'You wait patiently as your bobber floats...',
  'After a few minutes of waiting, you feel a tug...',
  'The water ripples as something takes your bait...',
  'You reel in your catch with expert precision...',
];

const MINE_SPOTS = [
  'abandoned gold mine',
  'dark, damp cave',
  'backyard rock quarry',
  'volcanic obsidian vent',
  'deep-sea mineral trench',
];

// ---- commands --------------------------------------------------------------

export default [
  {
    name: 'beg',
    category: 'economy',
    description: 'Beg for coins (30 minute cooldown)',
    guildOnly: true,
    run: async ({ message }) => {
      const { guildId } = message;
      const userId = message.author.id;
      await ensureUser(guildId, userId);

      const left = await claim(guildId, userId, 'beg', 30 * 60 * 1000);
      if (left) return message.reply(`You begged recently. Try again in **${duration(left)}**.`);

      if (Math.random() >= 0.7) return message.reply(pick(BEG_FAIL));

      const amount = randInt(50, 200);
      await addBalance(guildId, userId, amount);
      return message.reply(pick(BEG_WIN)(amount));
    },
  },

  {
    name: 'crime',
    category: 'economy',
    description: 'Commit a crime for coins, but risk jail: crime <type>',
    guildOnly: true,
    run: async ({ message, args, prefix }) => {
      const { guildId } = message;
      const userId = message.author.id;

      const key = args.join('-').toLowerCase();
      const crime = CRIMES.find((c) => crimeKey(c) === key);
      if (!crime) {
        const types = CRIMES.map((c) => `\`${crimeKey(c)}\``).join(', ');
        return message.reply(`Usage: \`${prefix}crime <type>\`\nTypes: ${types}`);
      }

      const jailed = await cooldownLeft(guildId, userId, 'jail');
      if (jailed) return message.reply(`You're in jail for **${duration(jailed)}** more.`);

      const left = await claim(guildId, userId, 'crime', 60 * 60 * 1000);
      if (left) return message.reply(`Lay low for **${duration(left)}** before your next crime.`);

      if (Math.random() > crime.risk) {
        const amount = randInt(crime.min, crime.max);
        await addBalance(guildId, userId, amount);
        return message.reply(`You pulled off **${crime.name}** and earned **${fmt(amount)}** coins!`);
      }

      const wallet = await getBalance(guildId, userId);
      const fine = Math.min(Math.floor(((crime.min + crime.max) / 2) * 0.2), wallet);
      await addBalance(guildId, userId, -fine);
      await setCooldown(guildId, userId, 'jail', 2 * 60 * 60 * 1000);
      return message.reply(
        `You were caught attempting **${crime.name}**! You were fined **${fmt(fine)}** coins and sent to jail for 2 hours.`,
      );
    },
  },

  {
    name: 'fish',
    category: 'economy',
    description: 'Go fishing and sell your catch (45 minute cooldown)',
    guildOnly: true,
    run: async ({ message }) => {
      const { guildId } = message;
      const userId = message.author.id;
      await ensureUser(guildId, userId);

      const left = await claim(guildId, userId, 'fish', 45 * 60 * 1000);
      if (left) return message.reply(`You're too tired to fish. Rest for **${duration(left)}**.`);

      const roll = Math.random();
      const caught =
        roll < 0.5 ? pick(byRarity('common'))
        : roll < 0.75 ? pick(byRarity('uncommon'))
        : roll < 0.9 ? pick(byRarity('rare'))
        : roll < 0.98 ? byRarity('epic')[0]
        : byRarity('legendary')[0];

      let earned = randInt(300, 900);
      let bonus = '';
      if ((await itemQty(guildId, userId, 'Fishing Rod')) > 0) {
        earned = Math.floor(earned * 1.5);
        bonus = '\n🎣 **Fishing Rod bonus: +50%**';
      }

      await addBalance(guildId, userId, earned);
      return message.reply(
        `${pick(CATCH_LINES)}\n\nYou caught a **${caught.emoji} ${caught.name}** (${caught.rarity}) and sold it for **${fmt(earned)}** coins!${bonus}`,
      );
    },
  },

  {
    name: 'mine',
    category: 'economy',
    description: 'Go mining for coins (1 hour cooldown)',
    guildOnly: true,
    run: async ({ message }) => {
      const { guildId } = message;
      const userId = message.author.id;
      await ensureUser(guildId, userId);

      const left = await claim(guildId, userId, 'mine', 60 * 60 * 1000);
      if (left) return message.reply(`Your pickaxe is cooling down. Wait **${duration(left)}**.`);

      let earned = randInt(400, 1200);
      let bonus = '';
      if ((await itemQty(guildId, userId, 'Diamond Pickaxe')) > 0) {
        earned = Math.floor(earned * 2);
        bonus = '\n💎 **Diamond Pickaxe bonus: +100%**';
      } else if ((await itemQty(guildId, userId, 'Pickaxe')) > 0) {
        earned = Math.floor(earned * 1.2);
        bonus = '\n⛏️ **Pickaxe bonus: +20%**';
      }

      await addBalance(guildId, userId, earned);
      return message.reply(
        `You explored a **${pick(MINE_SPOTS)}** and found minerals worth **${fmt(earned)}** coins!${bonus}`,
      );
    },
  },

  {
    name: 'gamble',
    category: 'economy',
    description: 'Bet coins for a 40% chance to double them: gamble <amount>',
    guildOnly: true,
    run: async ({ message, args, prefix }) => {
      const { guildId } = message;
      const userId = message.author.id;

      const bet = Number.parseInt(args[0], 10);
      if (!Number.isInteger(bet) || bet <= 0) return message.reply(`Usage: \`${prefix}gamble <amount>\``);

      const wallet = await getBalance(guildId, userId);
      if (wallet < bet) return message.reply(`You only have **${fmt(wallet)}** coins.`);

      const left = await claim(guildId, userId, 'gamble', 5 * 60 * 1000);
      if (left) return message.reply(`Cool down for **${duration(left)}** before gambling again.`);

      let chance = 0.4;
      let note = '';
      if (await consumeItem(guildId, userId, 'Lucky Clover')) {
        chance += 0.1;
        note = '\n🍀 **Lucky Clover used:** your win chance was boosted!';
      } else if (await consumeItem(guildId, userId, 'Lucky Charm')) {
        chance += 0.08;
        note = '\n🍀 **Lucky Charm used:** your win chance was boosted!';
      }

      const win = Math.random() < chance;
      const { rows } = await pool.query(
        `UPDATE users SET balance = balance + $3
          WHERE guild_id=$1 AND user_id=$2 AND balance >= $4 RETURNING balance`,
        [guildId, userId, win ? bet : -bet, bet],
      );
      if (!rows.length) return message.reply("You don't have enough coins any more.");

      return message.reply(
        win
          ? `🎉 You won! Your **${fmt(bet)}** bet became **${fmt(bet * 2)}**. Balance: **${fmt(rows[0].balance)}**.${note}`
          : `💔 You lost your **${fmt(bet)}** bet. Balance: **${fmt(rows[0].balance)}**.${note}`,
      );
    },
  },

  {
    name: 'rob',
    category: 'economy',
    description: "Try to steal from someone's wallet (4 hour cooldown): rob @user",
    guildOnly: true,
    run: async ({ message, args, prefix }) => {
      const { guildId } = message;
      const robberId = message.author.id;
      const victimId = parseUserMention(args[0] ?? '');

      if (!victimId) return message.reply(`Usage: \`${prefix}rob @user\``);
      if (victimId === robberId) return message.reply('You cannot rob yourself.');

      if ((await getBalance(guildId, victimId)) < 500) {
        return message.reply(`<@${victimId}> needs at least **500** coins in their wallet to be worth robbing.`);
      }

      const left = await claim(guildId, robberId, 'rob', 4 * 60 * 60 * 1000);
      if (left) return message.reply(`Lay low for **${duration(left)}** before another robbery.`);

      if ((await itemQty(guildId, victimId, 'Personal Safe')) > 0) {
        return message.reply(
          `<@${victimId}> was prepared! They own a **Personal Safe**, so you got away clean but gained nothing.`,
        );
      }

      const text = await tx(async (db) => {
        await ensureUser(guildId, robberId, db);
        await ensureUser(guildId, victimId, db);
        const { rows } = await db.query(
          `SELECT user_id, balance FROM users
            WHERE guild_id=$1 AND user_id = ANY($2) ORDER BY user_id FOR UPDATE`,
          [guildId, [robberId, victimId]],
        );
        const bal = Object.fromEntries(rows.map((r) => [r.user_id, Number(r.balance)]));

        if (bal[victimId] < 500) return `<@${victimId}> no longer has enough coins to rob.`;

        if (Math.random() < 0.4) {
          const stolen = Math.max(1, Math.floor(bal[victimId] * 0.15));
          await db.query('UPDATE users SET balance = balance - $3 WHERE guild_id=$1 AND user_id=$2', [guildId, victimId, stolen]);
          await db.query('UPDATE users SET balance = balance + $3 WHERE guild_id=$1 AND user_id=$2', [guildId, robberId, stolen]);
          return `You stole **${fmt(stolen)}** coins from <@${victimId}>!`;
        }

        const fine = Math.floor(bal[robberId] * 0.1);
        await db.query('UPDATE users SET balance = balance - $3 WHERE guild_id=$1 AND user_id=$2', [guildId, robberId, fine]);
        return `You failed the robbery and were caught! You were fined **${fmt(fine)}** coins.`;
      });

      return message.reply(text);
    },
  },

  {
    name: 'deposit',
    aliases: ['dep'],
    category: 'economy',
    description: 'Move coins from your wallet to your bank: deposit <amount|all>',
    guildOnly: true,
    run: async ({ message, args, prefix }) => {
      const { guildId } = message;
      const userId = message.author.id;
      const raw = args[0]?.toLowerCase();
      if (!raw) return message.reply(`Usage: \`${prefix}deposit <amount|all>\``);

      const cap = await bankCapacity(guildId, userId);

      const text = await tx(async (db) => {
        await ensureUser(guildId, userId, db);
        const { rows } = await db.query(
          'SELECT balance, bank FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [guildId, userId],
        );
        const wallet = Number(rows[0].balance);
        const bank = Number(rows[0].bank);

        let amount = raw === 'all' ? wallet : Number.parseInt(raw, 10);
        if (!Number.isInteger(amount) || amount <= 0) return `Usage: \`${prefix}deposit <amount|all>\``;

        amount = Math.min(amount, wallet, cap - bank);
        if (cap - bank <= 0) return `Your bank is full (**${fmt(cap)}** max). Buy a **Bank Note** to raise the limit.`;
        if (amount <= 0) return "You don't have any coins to deposit.";

        await db.query(
          'UPDATE users SET balance = balance - $3, bank = bank + $3 WHERE guild_id=$1 AND user_id=$2',
          [guildId, userId, amount],
        );
        return `Deposited **${fmt(amount)}** coins. Bank: **${fmt(bank + amount)}** / ${fmt(cap)}.`;
      });

      return message.reply(text);
    },
  },

  {
    name: 'withdraw',
    aliases: ['with'],
    category: 'economy',
    description: 'Move coins from your bank to your wallet: withdraw <amount|all>',
    guildOnly: true,
    run: async ({ message, args, prefix }) => {
      const { guildId } = message;
      const userId = message.author.id;
      const raw = args[0]?.toLowerCase();
      if (!raw) return message.reply(`Usage: \`${prefix}withdraw <amount|all>\``);

      const text = await tx(async (db) => {
        await ensureUser(guildId, userId, db);
        const { rows } = await db.query(
          'SELECT balance, bank FROM users WHERE guild_id=$1 AND user_id=$2 FOR UPDATE',
          [guildId, userId],
        );
        const bank = Number(rows[0].bank);

        let amount = raw === 'all' ? bank : Number.parseInt(raw, 10);
        if (!Number.isInteger(amount) || amount <= 0) return `Usage: \`${prefix}withdraw <amount|all>\``;
        if (bank <= 0) return 'Your bank account is empty.';

        amount = Math.min(amount, bank);
        await db.query(
          'UPDATE users SET balance = balance + $3, bank = bank - $3 WHERE guild_id=$1 AND user_id=$2',
          [guildId, userId, amount],
        );
        return `Withdrew **${fmt(amount)}** coins. Bank: **${fmt(bank - amount)}**.`;
      });

      return message.reply(text);
    },
  },
];

/*
Add this inside the migrate() query in src/db.js:

  ALTER TABLE users ADD COLUMN IF NOT EXISTS bank BIGINT NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS cooldowns (
    guild_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    action     TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (guild_id, user_id, action)
  );
*/
