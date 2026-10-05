import { parseUserMention } from '@fluxerjs/core';
import { pool, ensureUser } from '../db.js';
import { MANAGE, extractId, getGuild, requirePerm } from '../util.js';

const WORK_COOLDOWN_HOURS = 1;

export default [
  {
    name: 'work',
    description: `Earn 50-150 coins (once every ${WORK_COOLDOWN_HOURS}h)`,
    guildOnly: true,
    run: async ({ message }) => {
      const { guildId } = message;
      const userId = message.author.id;
      await ensureUser(guildId, userId);
      const pay = 50 + Math.floor(Math.random() * 101);
      const { rows } = await pool.query(
        `UPDATE users SET balance = balance + $3, last_work = now()
         WHERE guild_id=$1 AND user_id=$2
           AND (last_work IS NULL OR last_work < now() - interval '${WORK_COOLDOWN_HOURS} hours')
         RETURNING balance`,
        [guildId, userId, pay],
      );
      if (rows.length) return message.reply(`You worked a shift and earned **${pay}** coins. Balance: **${rows[0].balance}**.`);
      const wait = await pool.query(
        `SELECT EXTRACT(EPOCH FROM (last_work + interval '${WORK_COOLDOWN_HOURS} hours' - now())) AS secs
         FROM users WHERE guild_id=$1 AND user_id=$2`,
        [guildId, userId],
      );
      const mins = Math.ceil(Number(wait.rows[0].secs) / 60);
      await message.reply(`You're tired. Come back in **${mins}m**.`);
    },
  },
  {
    name: 'shop',
    description: 'Browse the server shop',
    guildOnly: true,
    run: async ({ message, prefix }) => {
      const { rows } = await pool.query(
        'SELECT id, name, price, role_id FROM shop_items WHERE guild_id=$1 ORDER BY id LIMIT 25',
        [message.guildId],
      );
      if (!rows.length) return message.reply('The shop is empty. Admins can add items with `additem`.');
      const lines = rows.map(
        (i) => `#${i.id} **${i.name}** - ${i.price} coins${i.role_id ? ' (gives a role)' : ''}`,
      );
      await message.reply(`**Shop**\n${lines.join('\n')}\nBuy with \`${prefix}buy <id>\``);
    },
  },
  {
    name: 'buy',
    description: 'Buy a shop item: buy <id>',
    guildOnly: true,
    run: async ({ message, args }) => {
      const itemId = Number.parseInt(args[0], 10);
      if (!Number.isInteger(itemId)) return message.reply('Usage: `buy <id>`');
      const { guildId } = message;
      const userId = message.author.id;

      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        const item = (
          await db.query('SELECT id, name, price, role_id FROM shop_items WHERE id=$1 AND guild_id=$2', [itemId, guildId])
        ).rows[0];
        if (!item) {
          await db.query('ROLLBACK');
          return message.reply('That item does not exist.');
        }
        await ensureUser(guildId, userId, db);
        const paid = await db.query(
          'UPDATE users SET balance = balance - $3 WHERE guild_id=$1 AND user_id=$2 AND balance >= $3',
          [guildId, userId, item.price],
        );
        if (!paid.rowCount) {
          await db.query('ROLLBACK');
          return message.reply("You don't have enough coins.");
        }
        await db.query(
          `INSERT INTO inventory (guild_id, user_id, item_id) VALUES ($1,$2,$3)
           ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET qty = inventory.qty + 1`,
          [guildId, userId, item.id],
        );
        if (item.role_id) {
          const guild = await getGuild(message);
          const member = guild.members.get(userId) ?? (await guild.fetchMember(userId));
          await member.roles.add(item.role_id);
        }
        await db.query('COMMIT');
        await message.reply(`You bought **${item.name}** for **${item.price}** coins.`);
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        console.error('buy failed:', err);
        await message.reply("The purchase failed and you weren't charged. (If it gives a role, my role must sit above it.)");
      } finally {
        db.release();
      }
    },
  },
  {
    name: 'inventory',
    aliases: ['inv'],
    description: 'See what you own',
    guildOnly: true,
    run: async ({ message }) => {
      const { rows } = await pool.query(
        `SELECT s.name, i.qty FROM inventory i JOIN shop_items s ON s.id = i.item_id
         WHERE i.guild_id=$1 AND i.user_id=$2 ORDER BY s.id`,
        [message.guildId, message.author.id],
      );
      if (!rows.length) return message.reply('Your inventory is empty.');
      await message.reply(`**Your inventory**\n${rows.map((r) => `${r.qty}x ${r.name}`).join('\n')}`);
    },
  },
  {
    name: 'additem',
    description: 'Admin: add a shop item: additem <price> <name>',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, MANAGE))) return;
      const price = Number.parseInt(args[0], 10);
      const name = args.slice(1).join(' ').slice(0, 60);
      if (!Number.isInteger(price) || price < 0 || !name) return message.reply('Usage: `additem <price> <name>`');
      const { rows } = await pool.query(
        'INSERT INTO shop_items (guild_id, name, price) VALUES ($1,$2,$3) RETURNING id',
        [message.guildId, name, price],
      );
      await message.reply(`Added **${name}** as item **#${rows[0].id}**. Use \`itemrole ${rows[0].id} @role\` to attach a role.`);
    },
  },
  {
    name: 'itemrole',
    description: 'Admin: role given on purchase: itemrole <id> @role (or none)',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, MANAGE))) return;
      const id = Number.parseInt(args[0], 10);
      const roleId = args[1]?.toLowerCase() === 'none' ? null : extractId(args[1]);
      if (!Number.isInteger(id) || (roleId === null && args[1]?.toLowerCase() !== 'none')) {
        return message.reply('Usage: `itemrole <id> @role` or `itemrole <id> none`');
      }
      const { rowCount } = await pool.query(
        'UPDATE shop_items SET role_id=$3 WHERE id=$1 AND guild_id=$2',
        [id, message.guildId, roleId],
      );
      await message.reply(rowCount ? 'Item updated.' : 'No item with that id.');
    },
  },
  {
    name: 'removeitem',
    description: 'Admin: remove a shop item: removeitem <id>',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, MANAGE))) return;
      const id = Number.parseInt(args[0], 10);
      if (!Number.isInteger(id)) return message.reply('Usage: `removeitem <id>`');
      const { rowCount } = await pool.query('DELETE FROM shop_items WHERE id=$1 AND guild_id=$2', [id, message.guildId]);
      await message.reply(rowCount ? `Removed item **#${id}**.` : 'No item with that id.');
    },
  },
  {
    name: 'addcoins',
    description: 'Admin: give coins: addcoins @user amount',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, MANAGE))) return;
      const userId = parseUserMention(args[0] ?? '');
      const amount = Number.parseInt(args[1], 10);
      if (!userId || !Number.isInteger(amount) || amount === 0) return message.reply('Usage: `addcoins @user amount`');
      await ensureUser(message.guildId, userId);
      const { rows } = await pool.query(
        'UPDATE users SET balance = GREATEST(balance + $3, 0) WHERE guild_id=$1 AND user_id=$2 RETURNING balance',
        [message.guildId, userId, amount],
      );
      await message.reply(`<@${userId}> now has **${rows[0].balance}** coins.`);
    },
  },
];
