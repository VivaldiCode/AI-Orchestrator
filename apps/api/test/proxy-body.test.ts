import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the proxy scope's body handling (see routes/proxy.ts).
 *
 * The proxy must keep request bodies as RAW BUFFERS so it can read the model and
 * forward the JSON verbatim to Ollama. Fastify ships a built-in application/json
 * parser that turns the body into an object; if it isn't removed, the body gets
 * coerced to "[object Object]" downstream and real Ollama rejects it with
 * `invalid character 'o' looking for beginning of value`.
 */
async function buildProxyScope() {
  const app = Fastify();
  await app.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    scope.post('/api/chat', async (req, reply) => {
      const b = req.body;
      reply.send({
        isBuffer: Buffer.isBuffer(b),
        forwarded: Buffer.isBuffer(b) ? b.toString('utf8') : String(b),
      });
    });
  });
  return app;
}

describe('proxy scope body parsing', () => {
  it('keeps application/json bodies as raw Buffers (forwarded verbatim)', async () => {
    const app = await buildProxyScope();
    const payload = JSON.stringify({
      model: 'gemma3:4b',
      messages: [{ role: 'user', content: 'hi' }],
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/chat',
      headers: { 'content-type': 'application/json' },
      payload,
    });
    const body = res.json() as { isBuffer: boolean; forwarded: string };
    expect(body.isBuffer).toBe(true); // false before the fix (parsed to an object)
    expect(body.forwarded).toBe(payload); // exact JSON, not "[object Object]"
    await app.close();
  });
});
