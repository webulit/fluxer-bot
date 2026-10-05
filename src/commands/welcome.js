import { Events } from '@fluxerjs/core';
import { pool } from '../db.js';
import { MANAGE, extractId, requirePerm } from '../util.js';

const DEFAULT_WELCOME = 'Welcome to {server}, {user}!';
const DEFAULT_GOODBYE = '{name} has left {server}.';
const COLUMNS = new Set([
  'welcome_channel', 'welcome_message', 'goodbye_channel', 'goodbye_message', 'autorole_id',
]);

async function setSetting(guildId, col, value) {
  if (!COLUMNS.has(col)) throw new Error('bad column');
  await pool.query(
    `INSERT INTO guild_settings (guild_id, ${col}) VALUES ($1, $2)
     ON CONFLICT (guild_id) DO UPDATE SET ${col} = $2`,
    [guildId, value],
  );
}

const fill = (tpl, vars) =>
  tpl.replace(/\{(user|name|server)\}/g, (_, k) => vars[k]);

export function registerWelcomeEvents(client) {
  const getSettings = async (guildId) =>
    (await pool.query('SELECT * FROM guild_settings WHERE guild_id=$1', [guildId])).rows[0];

  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const guildId = member.guildId ?? member.guild?.id;
      const userId = member.id ?? member.user?.id;
      if (!guildId || !userId) return;
      const s = await getSettings(guildId);
      if (!s) return;

      if (s.autorole_id) {
        await member.roles.add(s.autorole_id).catch((e) => console.error('autorole failed:', e.message));
      }
      if (s.welcome_channel) {
        const channel = await client.channels.fetch(s.welcome_channel);
        const server = member.guild?.name ?? client.guilds.get(guildId)?.name ?? 'the server';
        const name = member.user?.username ?? 'Someone';
        await channel.send(fill(s.welcome_message ?? DEFAULT_WELCOME, { user: `<@${userId}>`, name, server }));
      }
    } catch (err) {
      console.error('welcome error:', err);
    }
  });

  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const guildId = member.guildId ?? member.guild?.id;
      if (!guildId) return;
      const s = await getSettings(guildId);
      if (!s?.goodbye_channel) return;
      const channel = await client.channels.fetch(s.goodbye_channel);
      const server = member.guild?.name ?? client.guilds.get(guildId)?.name ?? 'the server';
      const name = member.user?.username ?? 'Someone';
      const userId = member.id ?? member.user?.id ?? '';
      await channel.send(fill(s.goodbye_message ?? DEFAULT_GOODBYE, { user: `<@${userId}>`, name, server }));
    } catch (err) {
      console.error('goodbye error:', err);
    }
  });
}

// Shared handler for "setwelcome #channel|off" style commands.
const channelSetter = (name, col, label) => ({
  name,
  description: `Set the ${label} channel: ${name} #channel (or off)`,
  guildOnly: true,
  run: async ({ message, args }) => {
    if (!(await requirePerm(message, MANAGE))) return;
    if (args[0]?.toLowerCase() === 'off') {
      await setSetting(message.guildId, col, null);
      return message.reply(`${label} messages turned off.`);
    }
    const id = extractId(args[0]);
    if (!id) return message.reply(`Usage: \`${name} #channel\` or \`${name} off\``);
    await setSetting(message.guildId, col, id);
    await message.reply(`${label} messages will go in <#${id}>.`);
  },
});

const textSetter = (name, col, label) => ({
  name,
  description: `Set the ${label} text. Use {user} {name} {server}`,
  guildOnly: true,
  run: async ({ message, args }) => {
    if (!(await requirePerm(message, MANAGE))) return;
    const text = args.join(' ');
    if (!text) return message.reply(`Usage: \`${name} Welcome {user} to {server}!\``);
    await setSetting(message.guildId, col, text);
    await message.reply(`${label} message saved.`);
  },
});

export default [
  channelSetter('setwelcome', 'welcome_channel', 'Welcome'),
  textSetter('welcomemsg', 'welcome_message', 'welcome'),
  channelSetter('setgoodbye', 'goodbye_channel', 'Goodbye'),
  textSetter('goodbyemsg', 'goodbye_message', 'goodbye'),
  {
    name: 'autorole',
    description: 'Role given to new members: autorole @role (or off)',
    guildOnly: true,
    run: async ({ message, args }) => {
      if (!(await requirePerm(message, MANAGE))) return;
      if (args[0]?.toLowerCase() === 'off') {
        await setSetting(message.guildId, 'autorole_id', null);
        return message.reply('Auto role turned off.');
      }
      const id = extractId(args[0]);
      if (!id) return message.reply('Usage: `autorole @role` or `autorole off`');
      await setSetting(message.guildId, 'autorole_id', id);
      await message.reply('Auto role saved. Make sure my role sits above it.');
    },
  },
];
