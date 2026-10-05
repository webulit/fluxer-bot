import utility from './utility.js';
import moderation from './moderation.js';
import modtools from './modtools.js';
import economy from './economy.js';
import shop from './shop.js';
import games from './games.js';
import leveling from './leveling.js';
import todo from './todo.js';
import welcome from './welcome.js';
import fun from './fun.js';

const tag = (category, list) => list.map((c) => ({ ...c, category }));

export default [
  ...tag('utility', utility),
  ...tag('moderation', [...moderation, ...modtools]),
  ...tag('economy', [...economy, ...shop]),
  ...tag('games', games),
  ...tag('leveling', leveling),
  ...tag('todo', todo),
  ...tag('server', welcome),
  ...tag('fun', fun),
];
