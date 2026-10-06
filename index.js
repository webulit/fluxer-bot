import 'dotenv/config';
import { Client, Events, parsePrefixCommand } from '@fluxerjs/core';
import { migrate } from './src/db.js';
import commands from './src/commands/index.js';
import { awardXp } from './src/commands/leveling.js';
import { registerWelcomeEvents } from './src/commands/welcome.js';
import { startGameNewsServer } from './src/gameNews.js';

if (!process.env.DATABASE_URL) {
  console.error(
    'DATABASE_URL is missing. Related vars seen:',
    Object.keys(process.env).filter((k) =>
      /DATABASE|PG|FLUXER/.test(k),
    ),
  );

  process.exit(1);
}

const PREFIX = process.env.PREFIX || '!';
const client = new Client();

startGameNewsServer(client);

const registry = new Map();

for (const cmd of commands) {
  registry.set(cmd.name, cmd);

  for (const alias of cmd.aliases ?? []) {
    registry.set(alias, cmd);
  }
}

client.on(Events.Ready, () => {
  console.log('Bot is online');
  console.log(`Command prefix: ${PREFIX}`);
  console.log(
    `Registered commands: ${Array.from(registry.keys()).join(', ')}`,
  );
});

registerWelcomeEvents(client);

client.on(Events.MessageCreate, async (message) => {
  console.log(
    'MESSAGE_CREATE:',
    message.author?.username,
    JSON.stringify(message.content),
  );

  if (message.author.bot || !message.content) {
    return;
  }

  const parsed = parsePrefixCommand(
    message.content,
    PREFIX,
  );

  console.log(
    'PARSED_COMMAND:',
    parsed
      ? JSON.stringify({
          command: parsed.command,
          args: parsed.args,
        })
      : 'null',
  );

  if (!parsed) {
    if (message.guildId) {
      awardXp(message).catch(console.error);
    }

    return;
  }

  const cmd = registry.get(parsed.command);

  console.log(
    'COMMAND_LOOKUP:',
    parsed.command,
    cmd ? 'FOUND' : 'NOT FOUND',
  );

  if (!cmd) {
    return;
  }

  if (cmd.guildOnly && !message.guildId) {
    await message.reply(
      'This command only works in a server.',
    );

    return;
  }

  try {
    console.log(
      `Executing command: ${parsed.command}`,
    );

    await cmd.run({
      message,
      args: parsed.args,
      prefix: PREFIX,
      commands,
    });

    console.log(
      `Command completed: ${parsed.command}`,
    );
  } catch (err) {
    console.error(
      `Error in ${cmd.name}:`,
      err,
    );

    await message
      .reply(
        'Something went wrong running that command.',
      )
      .catch(() => {});
  }
});

await migrate();

await client.login(
  process.env.FLUXER_BOT_TOKEN,
);
