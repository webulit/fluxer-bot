import { Client, Events, parsePrefixCommand } from '@fluxerjs/core';
import { migrate } from './src/db.js';
import commands from './src/commands/index.js';
import { awardXp } from './src/commands/leveling.js';

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
