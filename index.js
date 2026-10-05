import 'dotenv/config';
import { Client, Events, parsePrefixCommand } from '@fluxerjs/core';
import { migrate } from './src/db.js';
import commands from './src/commands/index.js';
import { awardXp } from './src/commands/leveling.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Related environment variables received:');
  const related = Object.keys(process.env)
    .filter((key) => /DATABASE|PG|FLUXER/i.test(key))
    .sort();
  if (related.length === 0) {
    console.error('  (none matching DATABASE, PG, or FLUXER)');
  }
  for (const key of related) {
    // Log names and value lengths only, to avoid leaking secrets such as tokens.
    console.error(`  ${key} (length ${(process.env[key] || '').length})`);
  }
  process.exit(1);
}

const PREFIX = process.env.PREFIX || '!';
const client = new Client();

const registry = new Map();
for (const cmd of commands) {
  registry.set(cmd.name, cmd);
  for (const alias of cmd.aliases ?? []) registry.set(alias, cmd);
}

client.on(Events.Ready, () => console.log('Bot is online'));

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.content) return;

  const parsed = parsePrefixCommand(message.content, PREFIX);
  if (!parsed) {
    if (message.guildId) awardXp(message).catch(console.error);
    return;
  }

  const cmd = registry.get(parsed.command);
  if (!cmd) return;

  if (cmd.guildOnly && !message.guildId) {
    await message.reply('This command only works in a server.');
    return;
  }

  try {
    await cmd.run({ message, args: parsed.args, prefix: PREFIX, commands });
  } catch (err) {
    console.error(`Error in ${cmd.name}:`, err);
    await message.reply('Something went wrong running that command.').catch(() => {});
  }
});

await migrate();
await client.login(process.env.FLUXER_BOT_TOKEN);
