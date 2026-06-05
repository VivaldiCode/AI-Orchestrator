// A dependency-free fake Ollama server for local testing / docker-compose.test.
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT || 11434);
const MODELS = (process.env.MODELS || 'llama3.2').split(',').map((m) => m.trim());
// Per-model context windows, surfaced via /api/show for context-aware routing.
const CONTEXT = { 'llama3.2': 131072, 'qwen2.5': 32768 };

const server = createServer((req, res) => {
  const url = req.url || '';
  const json = (obj) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  if (req.method === 'GET' && url.startsWith('/api/version'))
    return json({ version: '0.0.0-mock' });
  if (req.method === 'GET' && (url.startsWith('/api/tags') || url.startsWith('/api/ps'))) {
    return json({ models: MODELS.map((name) => ({ name })) });
  }
  if (req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      if (url.startsWith('/api/show')) {
        let name = MODELS[0];
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          name = body.name || body.model || name;
        } catch {
          /* ignore malformed body */
        }
        const ctx = CONTEXT[name] ?? 8192;
        return json({
          model_info: { 'general.architecture': 'llama', 'llama.context_length': ctx },
        });
      }
      json({
        model: MODELS[0],
        message: { role: 'assistant', content: 'hello from mock-ollama' },
        done: true,
        prompt_eval_count: 5,
        eval_count: 7,
      });
    });
    return;
  }
  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, () =>
  console.log(`mock-ollama listening on ${PORT} (models: ${MODELS.join(', ')})`),
);
