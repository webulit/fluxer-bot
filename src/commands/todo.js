import { pool } from '../db.js';

const USAGE = 'Usage: `todo add <text>`, `todo list`, `todo done <id>`, `todo remove <id>`, `todo clear`';

export default [
  {
    name: 'todo',
    description: 'Personal todo list: todo add|list|done|remove|clear',
    run: async ({ message, args }) => {
      const userId = message.author.id;
      const sub = args[0]?.toLowerCase();

      if (sub === 'add') {
        const text = args.slice(1).join(' ').slice(0, 200);
        if (!text) return message.reply(USAGE);
        const { rows } = await pool.query(
          'INSERT INTO todos (user_id, text) VALUES ($1, $2) RETURNING id',
          [userId, text],
        );
        return message.reply(`Added **#${rows[0].id}**: ${text}`);
      }

      if (sub === 'list' || !sub) {
        const { rows } = await pool.query(
          'SELECT id, text, done FROM todos WHERE user_id=$1 ORDER BY id LIMIT 25',
          [userId],
        );
        if (!rows.length) return message.reply('Your todo list is empty. Add one with `todo add <text>`.');
        const lines = rows.map((t) => `${t.done ? '[x]' : '[ ]'} #${t.id} ${t.done ? `~~${t.text}~~` : t.text}`);
        return message.reply(`**Your todos**\n${lines.join('\n')}`);
      }

      if (sub === 'done' || sub === 'remove') {
        const id = Number.parseInt(args[1], 10);
        if (!Number.isInteger(id)) return message.reply(USAGE);
        const q =
          sub === 'done'
            ? 'UPDATE todos SET done = NOT done WHERE id=$1 AND user_id=$2 RETURNING id'
            : 'DELETE FROM todos WHERE id=$1 AND user_id=$2 RETURNING id';
        const { rowCount } = await pool.query(q, [id, userId]);
        if (!rowCount) return message.reply("I couldn't find that todo on your list.");
        return message.reply(sub === 'done' ? `Toggled **#${id}**.` : `Removed **#${id}**.`);
      }

      if (sub === 'clear') {
        const { rowCount } = await pool.query('DELETE FROM todos WHERE user_id=$1 AND done', [userId]);
        return message.reply(`Cleared **${rowCount}** finished todos.`);
      }

      return message.reply(USAGE);
    },
  },
];
