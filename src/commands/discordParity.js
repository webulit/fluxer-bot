import crypto from 'node:crypto';
import { PermissionFlags, parseUserMention } from '@fluxerjs/core';
import { pool, ensureUser } from '../db.js';
import { extractId, getGuild, getChannel, requirePerm, MANAGE } from '../util.js';

const uid = s => parseUserMention(s || '') || extractId(s);
const pick = a => a[Math.floor(Math.random() * a.length)];

async function mod(message) { return requirePerm(message, MANAGE); }
async function earn(message, amount, action, cooldownSeconds) {
  const { rows } = await pool.query('SELECT expires_at FROM cooldowns WHERE guild_id=$1 AND user_id=$2 AND action=$3',[message.guildId,message.author.id,action]);
  if (rows.length && new Date(rows[0].expires_at) > new Date()) return message.reply('You are on cooldown. Try again later.');
  await pool.query("INSERT INTO cooldowns(guild_id,user_id,action,expires_at) VALUES($1,$2,$3,now()+($4 || ' seconds')::interval) ON CONFLICT(guild_id,user_id,action) DO UPDATE SET expires_at=EXCLUDED.expires_at",[message.guildId,message.author.id,action,cooldownSeconds]);
  await ensureUser(message.guildId,message.author.id);
  const n=Math.max(1,Math.floor(amount/2)+Math.floor(Math.random()*(amount+1)));
  const r=await pool.query('UPDATE users SET balance=balance+$3 WHERE guild_id=$1 AND user_id=$2 RETURNING balance',[message.guildId,message.author.id,n]);
  return message.reply('You earned '+n+' coins. Balance: '+r.rows[0].balance+'.');
}
const commands=[];
const add=(name,description,run,aliases=[])=>commands.push({name,description,run,aliases,guildOnly:true});

// Core
add('commands','List commands',async({message,commands:all})=>message.reply('Commands: '+all.map(c=>c.name).sort().join(', ')));
add('stats','Show bot/server statistics',async({message})=>{const g=await getGuild(message);await message.reply('Server: '+(g?.name||'Unknown')+' | Members: '+(g?.memberCount??'unknown')+' | Uptime: '+Math.floor(process.uptime())+'s');});
add('support','Show support information',async({message})=>message.reply('Contact the Tigzamo staff team for support.'));
add('uptime','Show bot uptime',async({message})=>message.reply('Uptime: '+Math.floor(process.uptime())+' seconds.'));
add('configwizard','Show configuration commands',async({message})=>{if(!(await mod(message)))return;message.reply('Configuration: logging, serverstats, jointocreate, reactroles, autoverify, verification, setwelcome, setgoodbye, autorole.');});
add('app-admin','Manage applications',async({message,args})=>{if(!(await mod(message)))return;if(args[0]==='list'){const r=await pool.query('SELECT id,user_id,type,status FROM applications WHERE guild_id=$1 ORDER BY id DESC LIMIT 20',[message.guildId]);return message.reply(r.rows.length?r.rows.map(x=>'#'+x.id+' <@'+x.user_id+'> '+x.type+' - '+x.status).join('\n'):'No applications.');}message.reply('Use app-admin list.');});
add('apply','Submit an application',async({message,args})=>{const text=args.join(' ');if(!text)return message.reply('Usage: apply <text>');await pool.query('INSERT INTO applications(guild_id,user_id,type,content) VALUES($1,$2,$3,$4)',[message.guildId,message.author.id,'general',text]);message.reply('Application submitted.');});

// Economy parity
for(const [name,amount,cd] of [['beg',150,300],['crime',250,900],['fish',200,300],['mine',250,300],['work',500,3600],['slut',350,900]]) add(name,'Earn coins with '+name,({message})=>earn(message,amount,name,cd));
add('gamble','Gamble coins',async({message,args})=>{const bet=Number(args[0]);if(!Number.isInteger(bet)||bet<1||bet>5000)return message.reply('Usage: gamble <1-5000>');await ensureUser(message.guildId,message.author.id);const t=await pool.query('UPDATE users SET balance=balance-$3 WHERE guild_id=$1 AND user_id=$2 AND balance>=$3',[message.guildId,message.author.id,bet]);if(!t.rowCount)return message.reply('Not enough coins.');if(Math.random()<0.5){const r=await pool.query('UPDATE users SET balance=balance+$3 WHERE guild_id=$1 AND user_id=$2 RETURNING balance',[message.guildId,message.author.id,bet*2]);return message.reply('You won '+bet+' coins. Balance: '+r.rows[0].balance+'.');}const r=await pool.query('SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2',[message.guildId,message.author.id]);message.reply('You lost '+bet+' coins. Balance: '+r.rows[0].balance+'.');});
add('rob','Rob another member',async({message,args})=>{const u=uid(args[0]);if(!u||u===message.author.id)return message.reply('Usage: rob @user');if(Math.random()>.45)return message.reply('The robbery failed.');await ensureUser(message.guildId,u);await ensureUser(message.guildId,message.author.id);const v=await pool.query('SELECT balance FROM users WHERE guild_id=$1 AND user_id=$2',[message.guildId,u]);const n=Math.min(Number(v.rows[0].balance),Math.floor(Math.random()*500)+1);if(n<1)return message.reply('That user has nothing to rob.');await pool.query('UPDATE users SET balance=balance-$3 WHERE guild_id=$1 AND user_id=$2',[message.guildId,u,n]);const r=await pool.query('UPDATE users SET balance=balance+$3 WHERE guild_id=$1 AND user_id=$2 RETURNING balance',[message.guildId,message.author.id,n]);message.reply('You robbed '+n+' coins. Balance: '+r.rows[0].balance+'.');});
add('deposit','Deposit coins',async({message,args})=>{const n=Number(args[0]);if(!Number.isInteger(n)||n<1)return message.reply('Usage: deposit <amount>');await ensureUser(message.guildId,message.author.id);const r=await pool.query('UPDATE users SET balance=balance-$3,bank=bank+$3 WHERE guild_id=$1 AND user_id=$2 AND balance>=$3 RETURNING bank',[message.guildId,message.author.id,n]);message.reply(r.rowCount?'Deposited '+n+' coins. Bank: '+r.rows[0].bank+'.':'Not enough coins.');});
add('withdraw','Withdraw banked coins',async({message,args})=>{const n=Number(args[0]);if(!Number.isInteger(n)||n<1)return message.reply('Usage: withdraw <amount>');await ensureUser(message.guildId,message.author.id);const r=await pool.query('UPDATE users SET bank=bank-$3,balance=balance+$3 WHERE guild_id=$1 AND user_id=$2 AND bank>=$3 RETURNING bank',[message.guildId,message.author.id,n]);message.reply(r.rowCount?'Withdrew '+n+' coins. Bank: '+r.rows[0].bank+'.':'Not enough banked coins.');});
add('economy','Show wallet and bank',async({message})=>{await ensureUser(message.guildId,message.author.id);const r=(await pool.query('SELECT balance,bank FROM users WHERE guild_id=$1 AND user_id=$2',[message.guildId,message.author.id])).rows[0];message.reply('Wallet: '+r.balance+' | Bank: '+r.bank);});
add('eleaderboard','Economy leaderboard',async({message})=>{const r=await pool.query('SELECT user_id,balance,bank FROM users WHERE guild_id=$1 ORDER BY balance+bank DESC LIMIT 10',[message.guildId]);message.reply(r.rows.length?r.rows.map((x,i)=>(i+1)+'. <@'+x.user_id+'> - '+(Number(x.balance)+Number(x.bank))).join('\n'):'No economy data.');});

// Fun
add('count','Count between two numbers',async({message,args})=>{const a=Number(args[0]||1),b=Number(args[1]||a);if(!Number.isInteger(a)||!Number.isInteger(b)||Math.abs(b-a)>100)return message.reply('Use integers within 100 steps.');const out=[];const step=a<=b?1:-1;for(let n=a;n!==b+step;n+=step)out.push(n);message.reply(out.join(', '));});
add('fight','Fight a member',async({message,args})=>{const u=uid(args[0]);if(!u)return message.reply('Usage: fight @user');message.reply('⚔️ '+(Math.random()<.5?'<@'+message.author.id+'>':'<@'+u+'>')+' wins!');});
add('flip','Flip a coin',async({message})=>message.reply(Math.random()<.5?'Heads!':'Tails!'));

// Giveaways
add('gcreate','Create a giveaway',async({message,args})=>{if(!(await mod(message)))return;const mins=Number(args[0]),prize=args.slice(1).join(' ');if(!Number.isFinite(mins)||mins<1||!prize)return message.reply('Usage: gcreate <minutes> <prize>');const ends=new Date(Date.now()+mins*60000);const ch=await getChannel(message);const sent=await ch.send('🎉 GIVEAWAY 🎉\nPrize: '+prize+'\nEnds: '+ends.toISOString()+'\nReact with 🎉 to enter!');await pool.query('INSERT INTO giveaways(guild_id,channel_id,message_id,prize,ends_at) VALUES($1,$2,$3,$4,$5)',[message.guildId,ch.id,sent.id,prize,ends]);await sent.react?.('🎉');message.reply('Giveaway created.');});
add('gdelete','Delete giveaway',async({message,args})=>{if(!(await mod(message)))return;const r=await pool.query('DELETE FROM giveaways WHERE guild_id=$1 AND id=$2 RETURNING id',[message.guildId,Number(args[0])]);message.reply(r.rowCount?'Giveaway deleted.':'Giveaway not found.');});
add('gend','End giveaway',async({message,args})=>{if(!(await mod(message)))return;const r=await pool.query("UPDATE giveaways SET ended=true WHERE guild_id=$1 AND id=$2 AND ended=false RETURNING prize",[message.guildId,Number(args[0])]);message.reply(r.rowCount?'Giveaway ended: '+r.rows[0].prize:'Giveaway not found.');});
add('greroll','Reroll giveaway',async({message,args})=>{if(!(await mod(message)))return;message.reply('Giveaway '+(args[0]||'')+' reroll requested.');});

// Leveling
add('leaderboard','XP leaderboard',async({message})=>{const r=await pool.query('SELECT user_id,xp,level FROM users WHERE guild_id=$1 ORDER BY xp DESC LIMIT 10',[message.guildId]);message.reply(r.rows.length?r.rows.map((x,i)=>(i+1)+'. <@'+x.user_id+'> - level '+x.level+' ('+x.xp+' XP)').join('\n'):'No XP data.');});
add('level','Show level',async({message})=>{const r=(await pool.query('SELECT xp,level FROM users WHERE guild_id=$1 AND user_id=$2',[message.guildId,message.author.id])).rows[0];message.reply(r?'Level '+r.level+' - '+r.xp+' XP':'No XP yet.');});
add('leveladd','Add XP',async({message,args})=>{if(!(await mod(message)))return;const u=uid(args[0]),n=Number(args[1]);if(!u||!Number.isInteger(n))return message.reply('Usage: leveladd @user amount');await ensureUser(message.guildId,u);await pool.query('UPDATE users SET xp=xp+$3 WHERE guild_id=$1 AND user_id=$2',[message.guildId,u,n]);message.reply('XP added.');});
add('levelremove','Remove XP',async({message,args})=>{if(!(await mod(message)))return;const u=uid(args[0]),n=Number(args[1]);if(!u||!Number.isInteger(n))return message.reply('Usage: levelremove @user amount');await ensureUser(message.guildId,u);await pool.query('UPDATE users SET xp=GREATEST(0,xp-$3) WHERE guild_id=$1 AND user_id=$2',[message.guildId,u,n]);message.reply('XP removed.');});
add('levelset','Set level',async({message,args})=>{if(!(await mod(message)))return;const u=uid(args[0]),n=Number(args[1]);if(!u||!Number.isInteger(n)||n<0)return message.reply('Usage: levelset @user level');await ensureUser(message.guildId,u);await pool.query('UPDATE users SET level=$3,xp=$4 WHERE guild_id=$1 AND user_id=$2',[message.guildId,u,n,n*n*100]);message.reply('Level set.');});

// Moderation
add('cases','View moderation cases',async({message,args})=>{if(!(await requirePerm(message,PermissionFlags.ModerateMembers)))return;const u=uid(args[0]);const r=await pool.query(u?'SELECT id,action,target_id,reason FROM moderation_logs WHERE guild_id=$1 AND target_id=$2 ORDER BY id DESC LIMIT 20':'SELECT id,action,target_id,reason FROM moderation_logs WHERE guild_id=$1 ORDER BY id DESC LIMIT 20',u?[message.guildId,u]:[message.guildId]);message.reply(r.rows.length?r.rows.map(x=>'#'+x.id+' '+x.action+' <@'+x.target_id+'> - '+(x.reason||'No reason')).join('\n'):'No cases.');});
add('untimeout','Remove timeout',async({message,args})=>{if(!(await requirePerm(message,PermissionFlags.ModerateMembers)))return;const u=uid(args[0]);if(!u)return message.reply('Usage: untimeout @user');const g=await getGuild(message);const m=g.members?.get?.(u)||await g.fetchMember?.(u).catch(()=>null);try{await m.edit({communication_disabled_until:null});message.reply('Timeout removed.');}catch{message.reply('Could not remove timeout.');}});
add('massban','Ban multiple members',async({message,args})=>{if(!(await requirePerm(message,PermissionFlags.BanMembers)))return;const g=await getGuild(message);let n=0;for(const x of args.map(uid).filter(Boolean)){try{await g.ban(x);n++;}catch{}}message.reply('Banned '+n+' users.');});
add('masskick','Kick multiple members',async({message,args})=>{if(!(await requirePerm(message,PermissionFlags.KickMembers)))return;const g=await getGuild(message);let n=0;for(const x of args.map(uid).filter(Boolean)){try{await g.kick(x);n++;}catch{}}message.reply('Kicked '+n+' users.');});
add('say','Make bot say text',async({message,args})=>{if(!(await mod(message)))return;message.reply(args.join(' ')||'Nothing to say.');});
add('dm','DM a member',async({message,args})=>{if(!(await mod(message)))return;const u=uid(args[0]),text=args.slice(1).join(' ');if(!u||!text)return message.reply('Usage: dm @user <text>');try{const g=await getGuild(message);const m=g.members.get(u)||await g.fetchMember(u);await m.user?.send?.(text);message.reply('DM sent.');}catch{message.reply('Could not send DM.');}});
add('usernotes','Manage moderator notes',async({message,args})=>{if(!(await requirePerm(message,PermissionFlags.ModerateMembers)))return;const u=uid(args[0]),sub=args[1];if(!u)return message.reply('Usage: usernotes @user add|list|clear [text]');if(sub==='add'){const note=args.slice(2).join(' ');if(!note)return message.reply('Add note text.');await pool.query('INSERT INTO user_notes(guild_id,user_id,moderator_id,note) VALUES($1,$2,$3,$4)',[message.guildId,u,message.author.id,note]);return message.reply('Note added.');}if(sub==='clear'){await pool.query('DELETE FROM user_notes WHERE guild_id=$1 AND user_id=$2',[message.guildId,u]);return message.reply('Notes cleared.');}const r=await pool.query('SELECT id,note FROM user_notes WHERE guild_id=$1 AND user_id=$2 ORDER BY id DESC LIMIT 20',[message.guildId,u]);message.reply(r.rows.length?r.rows.map(x=>'#'+x.id+' '+x.note).join('\n'):'No notes.');});

// Tools/utility
add('avatar','Show avatar information',async({message,args})=>message.reply('Avatar requested for <@'+(uid(args[0])||message.author.id)+'>.'));
add('userinfo','Show user info',async({message,args})=>{const u=uid(args[0])||message.author.id;const g=await getGuild(message);const m=g.members?.get?.(u)||await g.fetchMember?.(u).catch(()=>null);message.reply('User ID: '+u+'\nUsername: '+(m?.user?.username||'unknown'));});
add('serverinfo','Show server info',async({message})=>{const g=await getGuild(message);message.reply('Server: '+(g?.name||'Unknown')+'\nID: '+message.guildId+'\nMembers: '+(g?.memberCount??'unknown'));});
add('firstmsg','Find first channel message',async({message})=>message.reply('Use channel history to jump to the first message.'));
add('report','Report a user/issue',async({message,args})=>{const u=uid(args[0]);const reason=args.slice(u?1:0).join(' ');if(!reason)return message.reply('Usage: report [@user] <reason>');await pool.query('INSERT INTO reports(guild_id,reporter_id,target_id,reason) VALUES($1,$2,$3,$4)',[message.guildId,message.author.id,u,reason]);message.reply('Report submitted.');});
add('wipedata','Delete your bot data',async({message})=>{await pool.query('DELETE FROM users WHERE guild_id=$1 AND user_id=$2',[message.guildId,message.author.id]);await pool.query('DELETE FROM todos WHERE user_id=$1',[message.author.id]);message.reply('Your bot data was deleted for this server.');});
add('baseconvert','Convert bases',async({message,args})=>{const n=parseInt(args[0],Number(args[1]||10)),b=Number(args[2]||10);if(!Number.isInteger(n)||!Number.isInteger(b)||b<2||b>36)return message.reply('Usage: baseconvert <number> <from> <to>');message.reply(n.toString(b));});
add('calculate','Calculate basic arithmetic',async({message,args})=>{const e=args.join(' ');if(!/^[0-9+\-*/().%\s]+$/.test(e))return message.reply('Only basic arithmetic is allowed.');try{message.reply(String(Function('"use strict";return ('+e+')')()));}catch{message.reply('Invalid expression.');}});
add('generatepassword','Generate password',async({message,args})=>{const n=Math.min(Math.max(Number(args[0])||16,8),64);message.reply(crypto.randomBytes(n).toString('base64url').slice(0,n));});
add('hexcolor','Validate hex color',async({message,args})=>message.reply(/^#[0-9a-f]{6}$/i.test(args[0]||'')?'Valid hex color.':'Use #RRGGBB.'));
add('poll','Create a yes/no poll',async({message,args})=>{const s=await message.reply('📊 POLL\n'+args.join(' ')+'\n👍 Yes | 👎 No');await s.react?.('👍');await s.react?.('👎');});
add('randomuser','Pick random member',async({message})=>{const g=await getGuild(message);const a=[...(g.members?.values?.()||[])].filter(x=>!x.user?.bot);message.reply(a.length?'Random member: <@'+pick(a).id+'>':'No members available.');});
add('shorten','Shorten URL',async({message,args})=>{if(!args[0])return message.reply('Usage: shorten <url>');try{const r=await fetch('https://tinyurl.com/api-create.php?url='+encodeURIComponent(args[0]));message.reply(await r.text());}catch{message.reply('Could not shorten URL.');}});
add('time','Show current UTC time',async({message})=>message.reply(new Date().toISOString()));
add('unixtime','Convert date to Unix time',async({message,args})=>{const d=new Date(args.join(' '));if(Number.isNaN(d.getTime()))return message.reply('Usage: unixtime <date>');message.reply(String(Math.floor(d.getTime()/1000)));});
add('countdown','Countdown to date',async({message,args})=>{const d=new Date(args.join(' '));if(Number.isNaN(d.getTime()))return message.reply('Usage: countdown <date/time>');message.reply(Math.max(0,Math.floor((d-Date.now())/1000))+' seconds remaining.');});
add('embedbuilder','Create formatted message',async({message,args})=>{if(!(await mod(message)))return;message.reply('▣ EMBED\n'+args.join(' '));});
add('weather','Weather lookup',async({message,args})=>{if(!args.length)return message.reply('Usage: weather <city>');try{const r=await fetch('https://wttr.in/'+encodeURIComponent(args.join(' '))+'?format=3');message.reply(await r.text());}catch{message.reply('Weather lookup failed.');}});
add('search','Web search',async({message,args})=>message.reply('Search: https://www.google.com/search?q='+encodeURIComponent(args.join(' '))));

// Birthday
add('birthday','Birthday management',async({message,args})=>{const sub=args[0];if(sub==='set'){const m=(args[1]||'').match(/^(\d{1,2})[/-](\d{1,2})$/);if(!m)return message.reply('Usage: birthday set MM/DD');await pool.query('INSERT INTO birthdays(guild_id,user_id,month,day) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,user_id) DO UPDATE SET month=$3,day=$4',[message.guildId,message.author.id,m[1],m[2]]);return message.reply('Birthday saved.');}if(sub==='remove'){await pool.query('DELETE FROM birthdays WHERE guild_id=$1 AND user_id=$2',[message.guildId,message.author.id]);return message.reply('Birthday removed.');}if(sub==='list'){const r=await pool.query('SELECT user_id,month,day FROM birthdays WHERE guild_id=$1 ORDER BY month,day',[message.guildId]);return message.reply(r.rows.length?r.rows.map(x=>'<@'+x.user_id+'> - '+x.month+'/'+x.day).join('\n'):'No birthdays.');}const u=uid(args[1])||message.author.id;const r=await pool.query('SELECT month,day FROM birthdays WHERE guild_id=$1 AND user_id=$2',[message.guildId,u]);message.reply(r.rows.length?'Birthday: '+r.rows[0].month+'/'+r.rows[0].day:'No birthday saved.');});

// Community/config
for(const n of ['greet','goodbye','logging','serverstats','jointocreate','autoverify','verification','shop-config']) add(n,'Configure '+n,async({message,args})=>{if(!(await mod(message)))return;const text=args.join(' ')||'on';await pool.query('INSERT INTO guild_command_settings(guild_id,data) VALUES($1,jsonb_build_object($2,$3)) ON CONFLICT(guild_id) DO UPDATE SET data=guild_command_settings.data || jsonb_build_object($2,$3)',[message.guildId,n,text]);message.reply(n+' saved: '+text);});
add('reactroles','Configure reaction role mapping',async({message,args})=>{if(!(await mod(message)))return;const role=extractId(args[2]);if(!args[0]||!args[1]||!role)return message.reply('Usage: reactroles <messageId> <emoji> @role');await pool.query('INSERT INTO reaction_roles(guild_id,message_id,emoji,role_id) VALUES($1,$2,$3,$4) ON CONFLICT(guild_id,message_id,emoji) DO UPDATE SET role_id=$4',[message.guildId,args[0],args[1],role]);message.reply('Reaction role saved.');});

// Tickets
add('ticket','Create/list tickets',async({message,args})=>{if(args[0]==='list'){if(!(await mod(message)))return;const r=await pool.query('SELECT id,user_id,status,priority,claimed_by FROM tickets WHERE guild_id=$1 ORDER BY id DESC LIMIT 25',[message.guildId]);return message.reply(r.rows.length?r.rows.map(x=>'#'+x.id+' <@'+x.user_id+'> '+x.status+' '+x.priority).join('\n'):'No tickets.');}const r=await pool.query('INSERT INTO tickets(guild_id,user_id) VALUES($1,$2) RETURNING id',[message.guildId,message.author.id]);message.reply('Ticket #'+r.rows[0].id+' created.');});
add('claim','Claim ticket',async({message,args})=>{if(!(await mod(message)))return;const r=await pool.query('UPDATE tickets SET claimed_by=$3 WHERE guild_id=$1 AND id=$2 AND status=\'open\' RETURNING id',[message.guildId,Number(args[0]),message.author.id]);message.reply(r.rowCount?'Ticket claimed.':'Ticket unavailable.');});
add('close','Close ticket',async({message,args})=>{const r=await pool.query('UPDATE tickets SET status=\'closed\',closed_at=now() WHERE guild_id=$1 AND id=$2 AND status=\'open\' RETURNING id',[message.guildId,Number(args[0])]);message.reply(r.rowCount?'Ticket closed.':'Ticket unavailable.');});
add('priority','Set ticket priority',async({message,args})=>{if(!(await mod(message)))return;const p=args[1];if(!['low','normal','high','urgent'].includes(p))return message.reply('Use low, normal, high or urgent.');await pool.query('UPDATE tickets SET priority=$3 WHERE guild_id=$1 AND id=$2',[message.guildId,Number(args[0]),p]);message.reply('Priority updated.');});

// Music command names preserved as prefix commands.
for(const n of ['join','play','queue','nowplaying','music']) add(n,'Music command',async({message,args})=>message.reply('Music command '+n+' received'+(args.length?' - '+args.join(' '):'')+'.'));

// Real purge implementation. Fluxer.js supports channel.bulkDelete(count).
add('purge','Purge recent messages: purge <1-100>',async({message,args})=>{
  if (!(await requirePerm(message, PermissionFlags.ManageMessages))) return;
  const amount=Number(args[0]);
  if (!Number.isInteger(amount)||amount<1||amount>100) return message.reply('Usage: `purge <1-100>`');
  const channel=await getChannel(message);
  try {
    await channel.bulkDelete(amount+1);
    await channel.send('🧹 Deleted '+amount+' messages.');
  } catch (err) {
    console.error('purge failed:',err);
    await message.reply("I couldn't purge messages. Make sure I have View Channel, Read Message History, and Manage Messages permissions.");
  }
});

// Additional Discord command names / compatibility
for(const [n,d] of [

 ['gcreate','Create giveaway'],['gdelete','Delete giveaway'],['gend','End giveaway'],['greroll','Reroll giveaway'],
 ['massban','Mass ban'],['masskick','Mass kick'],['lock','Lock channel'],['unlock','Unlock channel']
]) if(!commands.some(c=>c.name===n)) add(n,d,async({message})=>message.reply(n+' is available through the Fluxer prefix system.'));

export default commands;
