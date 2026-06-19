import { createServer, type Server } from 'node:http';
import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import type { AnalyticsRecorder } from '../src/analytics/recorder';
import { runAnthropicMessages } from '../src/anthropic/run';
import { db } from '../src/db/client';
import type { NodeRow } from '../src/db/schema';
import { Dispatcher } from '../src/orchestrator/dispatcher';
import { NodeRegistry } from '../src/orchestrator/registry';
import { RealtimeHub } from '../src/realtime/hub';

const SETTINGS: Settings = {
  strategy: 'round-robin',
  modelAware: true,
  contextAware: true,
  autoPull: false,
  failoverRetries: 2,
  triageEnabled: false,
  triageModel: '',
  maxToolCalls: 5,
  requestLogMax: 0,
  cloudOverflow: false,
  cloudOverflowProviderId: '',
  cloudOverflowModel: '',
  embedOverflow: false,
  embedOverflowProviderId: '',
  embedOverflowModel: '',
  privacyMode: false,
};

class MockRaw extends Writable {
  statusCode = 0;
  headers: Record<string, string> = {};
  private chunks: Buffer[] = [];
  writeHead(status: number, headers: Record<string, string>): this {
    this.statusCode = status;
    this.headers = headers;
    return this;
  }
  override _write(chunk: Buffer, _enc: BufferEncoding, cb: () => void): void {
    this.chunks.push(Buffer.from(chunk));
    cb();
  }
  body(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

function mockReply(): { reply: FastifyReply; raw: MockRaw; done: Promise<void> } {
  const raw = new MockRaw();
  const done = new Promise<void>((resolve) => raw.on('finish', () => resolve()));
  const reply = { hijack() {}, raw } as unknown as FastifyReply;
  return { reply, raw, done };
}

function mockRequest(body: unknown, headers: Record<string, string> = {}): FastifyRequest {
  return {
    method: 'POST',
    url: '/v1/messages',
    headers,
    body: Buffer.from(JSON.stringify(body)),
  } as unknown as FastifyRequest;
}

function fakeRow(id: string, port: number): NodeRow {
  return {
    id,
    name: id,
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

/** Read a request body to JSON. */
function readJson(req: import('node:http').IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        resolve({});
      }
    });
  });
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  return typeof addr === 'object' && addr ? addr.port : 0;
}

/** Mock OpenAI-compatible node: /v1/chat/completions (JSON + SSE), with tools. */
function startMockOpenAINode(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !(req.url ?? '').startsWith('/v1/chat/completions')) {
      res.statusCode = 404;
      res.end('nope');
      return;
    }
    const body = await readJson(req);
    const wantsTool = Array.isArray(body.tools) && (body.tools as unknown[]).length > 0;
    if (body.stream === true) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      if (wantsTool) {
        res.write(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"get_weather","arguments":""}}]}}]}\n\n',
        );
        res.write(
          'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"city\\":\\"Lisbon\\"}"}}]}}]}\n\n',
        );
        res.write(
          'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}],"usage":{"prompt_tokens":9,"completion_tokens":4}}\n\n',
        );
      } else {
        res.write('data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n');
        res.write('data: {"choices":[{"delta":{"content":" world"}}]}\n\n');
        res.write(
          'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2}}\n\n',
        );
      }
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'chatcmpl-1',
        object: 'chat.completion',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello world' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }),
    );
  });
  return listen(server).then((port) => ({
    port,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }));
}

/** Mock real Anthropic endpoint for the passthrough path. */
function startMockAnthropic(): Promise<{
  port: number;
  lastKey: () => string | undefined;
  close: () => Promise<void>;
}> {
  let lastKey: string | undefined;
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !(req.url ?? '').startsWith('/v1/messages')) {
      res.statusCode = 404;
      res.end('nope');
      return;
    }
    lastKey = req.headers['x-api-key'] as string | undefined;
    await readJson(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_real',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'from anthropic' }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 3, output_tokens: 4 },
      }),
    );
  });
  return listen(server).then((port) => ({
    port,
    lastKey: () => lastKey,
    close: () => new Promise<void>((r) => server.close(() => r())),
  }));
}

const NODE_ID = '44444444-4444-4444-4444-444444444444';

function buildApp(
  opts: { resolve?: () => unknown; list?: () => unknown[] },
  port: number,
): {
  app: FastifyInstance;
  registry: NodeRegistry;
} {
  const registry = new NodeRegistry(db);
  const node = registry.upsert(fakeRow(NODE_ID, port));
  node.runtime.status = 'up';
  node.runtime.models = ['llama3.1'];
  const hub = new RealtimeHub();
  const recorder = { record: async () => {} } as unknown as AnalyticsRecorder;
  const dispatcher = new Dispatcher(registry, hub, recorder, () => SETTINGS);
  const providers = {
    resolve: opts.resolve ?? (() => null),
    list: opts.list ?? (() => []),
    isOpenAIFamily: () => false,
    baseUrlFor: (cfg: { baseUrl?: string }) => cfg.baseUrl ?? null,
    overBudget: () => false,
  };
  const app = {
    providers,
    orchestrator: { getSettings: () => SETTINGS, dispatcher, registry, hub, recorder },
    archive: { enabled: false },
  } as unknown as FastifyInstance;
  return { app, registry };
}

describe('runAnthropicMessages (translate + passthrough)', () => {
  let node: Awaited<ReturnType<typeof startMockOpenAINode>>;
  let anthropic: Awaited<ReturnType<typeof startMockAnthropic>>;

  beforeAll(async () => {
    node = await startMockOpenAINode();
    anthropic = await startMockAnthropic();
  });
  afterAll(async () => {
    await node.close();
    await anthropic.close();
  });

  it('translates a non-streaming request and returns an Anthropic message', async () => {
    const { app } = buildApp({}, node.port);
    const { reply, raw, done } = mockReply();
    await runAnthropicMessages(
      app,
      mockRequest({
        model: 'llama3.1',
        max_tokens: 100,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      reply,
    );
    await done;
    expect(raw.statusCode).toBe(200);
    const msg = JSON.parse(raw.body());
    expect(msg.type).toBe('message');
    expect(msg.role).toBe('assistant');
    expect(msg.content).toEqual([{ type: 'text', text: 'Hello world' }]);
    expect(msg.usage).toEqual({ input_tokens: 5, output_tokens: 2 });
  });

  it('translates a streaming request into Anthropic SSE events', async () => {
    const { app } = buildApp({}, node.port);
    const { reply, raw, done } = mockReply();
    await runAnthropicMessages(
      app,
      mockRequest({
        model: 'llama3.1',
        max_tokens: 100,
        stream: true,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      reply,
    );
    await done;
    const blob = raw.body();
    expect(blob).toContain('event: message_start');
    expect(blob).toContain('event: content_block_start');
    expect(blob).toContain('event: message_stop');
    const text = blob
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => {
        try {
          return JSON.parse(l.slice(5).trim());
        } catch {
          return null;
        }
      })
      .filter((d) => d?.type === 'content_block_delta' && d.delta?.type === 'text_delta')
      .map((d) => d.delta.text)
      .join('');
    expect(text).toBe('Hello world');
  });

  it('streams a tool call as an Anthropic tool_use block', async () => {
    const { app } = buildApp({}, node.port);
    const { reply, raw, done } = mockReply();
    await runAnthropicMessages(
      app,
      mockRequest({
        model: 'llama3.1',
        max_tokens: 100,
        stream: true,
        tools: [{ name: 'get_weather', input_schema: { type: 'object' } }],
        messages: [{ role: 'user', content: 'weather?' }],
      }),
      reply,
    );
    await done;
    const blob = raw.body();
    expect(blob).toContain('"type":"tool_use"');
    expect(blob).toContain('"name":"get_weather"');
    expect(blob).toContain('input_json_delta');
  });

  it('passes through to a configured Anthropic provider (unmapped claude-* model)', async () => {
    const provider = {
      id: 'p-anthropic',
      type: 'anthropic',
      name: 'Anthropic',
      enabled: true,
      baseUrl: `http://127.0.0.1:${anthropic.port}`,
      credentials: { apiKey: 'sk-test-123' },
      budgetMonthlyUsd: 0,
    };
    const { app } = buildApp({ list: () => [provider] }, node.port);
    const { reply, raw, done } = mockReply();
    await runAnthropicMessages(
      app,
      mockRequest({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 50,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      reply,
    );
    await done;
    expect(raw.statusCode).toBe(200);
    const msg = JSON.parse(raw.body());
    expect(msg.content).toEqual([{ type: 'text', text: 'from anthropic' }]);
    expect(anthropic.lastKey()).toBe('sk-test-123');
  });
});
