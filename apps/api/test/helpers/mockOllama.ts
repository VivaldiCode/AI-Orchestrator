import { createServer, type Server } from 'node:http';

export interface MockOllama {
  url: string;
  port: number;
  server: Server;
  /** Number of inference requests received. */
  count: () => number;
  close: () => Promise<void>;
}

/** A minimal fake Ollama server for tests (version, tags, chat/generate). */
export async function startMockOllama(
  opts: { models?: string[]; label?: string } = {},
): Promise<MockOllama> {
  const models = opts.models ?? ['llama3.2'];
  let port = 0;
  let received = 0;

  const server = createServer((req, res) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url.startsWith('/api/version')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ version: '0.0.0-mock' }));
      return;
    }
    if (req.method === 'GET' && (url.startsWith('/api/tags') || url.startsWith('/api/ps'))) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ models: models.map((m) => ({ name: m })) }));
      return;
    }
    if (
      req.method === 'POST' &&
      (url.startsWith('/api/chat') ||
        url.startsWith('/api/generate') ||
        url.startsWith('/v1/chat/completions'))
    ) {
      received++;
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        res.setHeader('content-type', 'application/json');
        res.end(
          JSON.stringify({
            model: models[0],
            message: { role: 'assistant', content: `hi from ${opts.label ?? port}` },
            done: true,
            prompt_eval_count: 5,
            eval_count: 7,
          }),
        );
      });
      return;
    }
    res.statusCode = 404;
    res.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    url: `http://127.0.0.1:${port}`,
    port,
    server,
    count: () => received,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
