import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import type { AnalyticsRecorder } from '../src/analytics/recorder';
import { db } from '../src/db/client';
import type { NodeRow } from '../src/db/schema';
import { Dispatcher } from '../src/orchestrator/dispatcher';
import { NodeRegistry } from '../src/orchestrator/registry';
import { RealtimeHub } from '../src/realtime/hub';
import { runPlayground } from '../src/routes/admin/playground';

const SETTINGS: Settings = {
  strategy: 'round-robin',
  modelAware: true,
  contextAware: true,
  autoPull: false,
  failoverRetries: 2,
  triageEnabled: false,
  triageModel: '',
  maxToolCalls: 5,
  cloudOverflow: false,
  cloudOverflowProviderId: '',
  embedOverflow: false,
  embedOverflowProviderId: '',
  embedOverflowModel: '',
  privacyMode: false,
};

const NODE_ID = '55555555-5555-5555-5555-555555555555';

function fakeRow(id: string, port: number): NodeRow {
  return {
    id,
    name: 'mock-node',
    host: '127.0.0.1',
    port,
    protocol: 'http',
    weight: 1,
    enabled: true,
    maxConcurrency: 4,
    tags: [],
    agentPort: null,
    enabledModels: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as NodeRow;
}

/** Mock OpenAI-compatible node: /v1/chat/completions returning a fixed completion. */
function startNode(): Promise<{ port: number; close: () => Promise<void> }> {
  const server: Server = createServer((req, res) => {
    if (req.method !== 'POST' || !(req.url ?? '').startsWith('/v1/chat/completions')) {
      res.statusCode = 404;
      res.end('no');
      return;
    }
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          id: 'chatcmpl-x',
          object: 'chat.completion',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'Hello world' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 4, completion_tokens: 2 },
        }),
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ port, close: () => new Promise<void>((r) => server.close(() => r())) });
    });
  });
}

const PROVIDER_ID = '66666666-6666-6666-6666-666666666666';
const OPENAI_FAMILY = ['openai', 'xai', 'mistral', 'google', 'openai-compatible'];

function buildApp(port: number): FastifyInstance {
  const registry = new NodeRegistry(db);
  const node = registry.upsert(fakeRow(NODE_ID, port));
  node.runtime.status = 'up';
  node.runtime.models = ['llama3.1'];
  const hub = new RealtimeHub();
  const recorder = { record: async () => {} } as unknown as AnalyticsRecorder;
  const dispatcher = new Dispatcher(registry, hub, recorder, () => SETTINGS);
  // A configured OpenAI-compatible provider pointing at the same mock server.
  const providerCfg = {
    id: PROVIDER_ID,
    type: 'openai',
    name: 'OpenAI',
    enabled: true,
    baseUrl: `http://127.0.0.1:${port}`,
    region: null,
    defaultModel: 'gpt-x',
    budgetMonthlyUsd: 0,
    authMode: 'api-key',
    credentials: { apiKey: 'sk-test' },
  };
  return {
    providers: {
      resolve: () => null,
      list: () => [providerCfg],
      getConfig: (id: string) => (id === PROVIDER_ID ? providerCfg : undefined),
      isOpenAIFamily: (t: string) => OPENAI_FAMILY.includes(t),
      baseUrlFor: (c: { baseUrl?: string }) => c.baseUrl ?? null,
      overBudget: () => false,
    },
    orchestrator: { getSettings: () => SETTINGS, dispatcher, registry, hub, recorder },
    archive: { enabled: false },
  } as unknown as FastifyInstance;
}

describe('runPlayground', () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    node = await startNode();
    app = buildApp(node.port);
  });
  afterAll(async () => {
    await node.close();
  });

  it('runs an OpenAI-format request and reports who served it', async () => {
    const result = await runPlayground(
      app,
      'openai',
      { model: 'llama3.1', messages: [{ role: 'user', content: 'hi' }], stream: false },
      { ip: '127.0.0.1' },
    );
    expect(result.status).toBe(200);
    const body = result.body as { choices: { message: { content: string } }[] };
    expect(body.choices[0].message.content).toBe('Hello world');
    expect(result.servedBy.nodeName).toBe('mock-node');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('runs an Anthropic-format request (translated) and reports who served it', async () => {
    const result = await runPlayground(
      app,
      'anthropic',
      { model: 'llama3.1', max_tokens: 64, messages: [{ role: 'user', content: 'hi' }] },
      { ip: '127.0.0.1' },
    );
    expect(result.status).toBe(200);
    const body = result.body as { type: string; content: { type: string; text: string }[] };
    expect(body.type).toBe('message');
    expect(body.content[0].text).toBe('Hello world');
    expect(result.servedBy.nodeName).toBe('mock-node');
  });

  it('forces a chosen provider directly via providerId (route override)', async () => {
    const result = await runPlayground(
      app,
      'openai',
      { model: 'gpt-x', messages: [{ role: 'user', content: 'hi' }], stream: false },
      { ip: null },
      PROVIDER_ID,
    );
    expect(result.status).toBe(200);
    const body = result.body as { choices: { message: { content: string } }[] };
    expect(body.choices[0].message.content).toBe('Hello world');
    expect(result.servedBy.provider).toBe('openai');
  });

  it('returns 400 when the chosen provider does not exist', async () => {
    const result = await runPlayground(
      app,
      'openai',
      { model: 'x', messages: [{ role: 'user', content: 'hi' }], stream: false },
      { ip: null },
      'nope-not-a-provider',
    );
    expect(result.status).toBe(400);
  });

  it('surfaces a clean error when no node can serve the model', async () => {
    const empty = buildApp(node.port);
    (empty.orchestrator.registry as NodeRegistry).remove(NODE_ID);
    const result = await runPlayground(
      empty,
      'openai',
      { model: 'llama3.1', messages: [{ role: 'user', content: 'hi' }], stream: false },
      { ip: null },
    );
    expect(result.status).toBe(503);
    expect((result.body as { error: string }).error).toMatch(/no healthy nodes/i);
  });
});
