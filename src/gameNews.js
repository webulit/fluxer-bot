import http from 'node:http';

const GAME_NEWS_CHANNEL_ID = '1556633969884135454';

function buildMessage(body) {
  const game = String(body.game ?? '').trim();
  const title = String(body.title ?? '').trim();
  const message = String(body.message ?? '').trim();
  const url = String(body.url ?? '').trim();

  if (!game || !title || !message) {
    return null;
  }

  let output = `🎮 **${game}**\n\n`;
  output += `## ${title}\n`;
  output += message;

  if (url) {
    output += `\n\n🔗 ${url}`;
  }

  return output;
}

export function startGameNewsServer(client) {
  const server = http.createServer(async (req, res) => {
    // Health check for Railway
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ gameNewsServer: 'ALIVE', source: 'fluxer-bot' }));
      return;
    }

    if (req.method !== 'POST' || req.url !== '/game-news') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    const secret = process.env.GAME_NEWS_SECRET;

    if (!secret) {
      console.error('GAME_NEWS_SECRET is missing.');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server configuration error' }));
      return;
    }

    const providedSecret = req.headers['x-game-news-secret'];

    if (
      typeof providedSecret !== 'string' ||
      providedSecret !== secret
    ) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;

      // Prevent accidentally accepting huge requests.
      if (rawBody.length > 100_000) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const body = JSON.parse(rawBody);
        const content = buildMessage(body);

        if (!content) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'game, title and message are required',
            }),
          );
          return;
        }

        const channel = await client.channels.fetch(GAME_NEWS_CHANNEL_ID);

        if (!channel || typeof channel.send !== 'function') {
          throw new Error('Game-news channel could not be fetched.');
        }

        await channel.send(content);

        console.log(
          `Game news published: ${body.game} - ${body.title}`,
        );

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        console.error('Game news error:', err);

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Invalid request or failed to publish',
          }),
        );
      }
    });
  });

  const port = Number(process.env.PORT) || 3000;

  server.listen(port, '0.0.0.0', () => {
    console.log(`Game news API listening on port ${port}`);
  });

  return server;
}
