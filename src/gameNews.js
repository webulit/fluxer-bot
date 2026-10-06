import http from 'node:http';

const GAME_NEWS_CHANNEL_ID = '1556633969884135454';

function buildEmbed(body) {
  const game = String(body.game ?? '').trim();
  const title = String(body.title ?? '').trim();
  const message = String(body.message ?? '').trim();
  const url = String(body.url ?? '').trim();

  if (!game || !title || !message) {
    return null;
  }

  const suppliedEmbed =
    body.embed && typeof body.embed === 'object'
      ? body.embed
      : {};

  const embed = {
    title: String(suppliedEmbed.title ?? title),
    description: String(
      suppliedEmbed.description ?? message,
    ),
    color: Number(
      suppliedEmbed.color ?? 0x5865f2,
    ),
    footer: {
      text: String(
        suppliedEmbed.footer?.text ??
          `${game} • Game News`,
      ),
    },
    timestamp:
      suppliedEmbed.timestamp ??
      new Date().toISOString(),
  };

  const embedUrl = String(
    suppliedEmbed.url ?? url,
  ).trim();

  if (embedUrl) {
    embed.url = embedUrl;
  }

  return embed;
}

export function startGameNewsServer(client) {
  const server = http.createServer(async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
      });

      res.end(
        JSON.stringify({
          ok: true,
        }),
      );

      return;
    }

    if (
      req.method !== 'POST' ||
      req.url !== '/game-news'
    ) {
      res.writeHead(404, {
        'Content-Type': 'application/json',
      });

      res.end(
        JSON.stringify({
          error: 'Not found',
        }),
      );

      return;
    }

    const secret = process.env.GAME_NEWS_SECRET;

    if (!secret) {
      console.error(
        'GAME_NEWS_SECRET is missing.',
      );

      res.writeHead(500, {
        'Content-Type': 'application/json',
      });

      res.end(
        JSON.stringify({
          error: 'Server configuration error',
        }),
      );

      return;
    }

    const providedSecret =
      req.headers['x-game-news-secret'];

    if (
      typeof providedSecret !== 'string' ||
      providedSecret !== secret
    ) {
      res.writeHead(401, {
        'Content-Type': 'application/json',
      });

      res.end(
        JSON.stringify({
          error: 'Unauthorized',
        }),
      );

      return;
    }

    let rawBody = '';

    req.on('data', (chunk) => {
      rawBody += chunk;

      if (rawBody.length > 100_000) {
        req.destroy();
      }
    });

    req.on('end', async () => {
      try {
        const body = JSON.parse(rawBody);

        const game = String(
          body.game ?? '',
        ).trim();

        const title = String(
          body.title ?? '',
        ).trim();

        const message = String(
          body.message ?? '',
        ).trim();

        if (!game || !title || !message) {
          res.writeHead(400, {
            'Content-Type': 'application/json',
          });

          res.end(
            JSON.stringify({
              error:
                'game, title and message are required',
            }),
          );

          return;
        }

        const embed = buildEmbed(body);

        if (!embed) {
          res.writeHead(400, {
            'Content-Type': 'application/json',
          });

          res.end(
            JSON.stringify({
              error: 'Invalid embed data',
            }),
          );

          return;
        }

        const channel =
          await client.channels.fetch(
            GAME_NEWS_CHANNEL_ID,
          );

        if (
          !channel ||
          typeof channel.send !== 'function'
        ) {
          throw new Error(
            'Game-news channel could not be fetched.',
          );
        }

        await channel.send({
          embeds: [embed],
        });

        console.log(
          `Game news published: ${game} - ${title}`,
        );

        res.writeHead(200, {
          'Content-Type': 'application/json',
        });

        res.end(
          JSON.stringify({
            ok: true,
          }),
        );
      } catch (err) {
        console.error(
          'Game news error:',
          err,
        );

        res.writeHead(400, {
          'Content-Type': 'application/json',
        });

        res.end(
          JSON.stringify({
            error:
              'Invalid request or failed to publish',
          }),
        );
      }
    });
  });

  const port =
    Number(process.env.PORT) || 3000;

  server.listen(
    port,
    '0.0.0.0',
    () => {
      console.log(
        `Game news API listening on port ${port}`,
      );
    },
  );

  return server;
}
