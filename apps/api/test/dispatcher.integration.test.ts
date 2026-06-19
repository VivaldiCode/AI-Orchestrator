import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import type { AnalyticsRecorder } from '../src/analytics/recorder';
import { db } from '../src/db/client';
import type { NodeRow } from '../src/db/schema';
import { Dispatcher, parseEmbedRequest } from '../src/orchestrator/dispatcher';
import { NodeRegistry } from '../src/orchestrator/registry';
import { RealtimeHub } from '../src/realtime/hub';
import { startMockOllama, type MockOllama } from './helpers/mockOllama';

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

function mockRequest(body: unknown, url = '/api/chat'): FastifyRequest {
  return {
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify(body)),
    // Mirror real Fastify: once the body is parsed into a buffer the request's
    // readable side is destroyed. The dispatcher must NOT treat this as a client
    // disconnect (it watches the reply socket instead), or queued requests 503.
    raw: { destroyed: true },
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

const ID_A = '11111111-1111-1111-1111-111111111111';
const ID_B = '22222222-2222-2222-2222-222222222222';
const ID_DEAD = '33333333-3333-3333-3333-333333333333';

describe('Dispatcher (integration with mock Ollama)', () => {
  let a: MockOllama;
  let b: MockOllama;
  let registry: NodeRegistry;
  let dispatcher: Dispatcher;
  const settings: Settings = {
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
  const recorder = { record: async () => {} } as unknown as AnalyticsRecorder;

  beforeAll(async () => {
    a = await startMockOllama({ label: 'A' });
    b = await startMockOllama({ label: 'B' });
    registry = new NodeRegistry(db);
    for (const [id, port] of [
      [ID_A, a.port],
      [ID_B, b.port],
    ] as const) {
      const n = registry.upsert(fakeRow(id, port));
      n.runtime.status = 'up';
      n.runtime.models = ['llama3.2'];
    }
    dispatcher = new Dispatcher(registry, new RealtimeHub(), recorder, () => settings);
  });

  afterAll(async () => {
    await a.close();
    await b.close();
  });

  it('proxies a chat request and returns the node response', async () => {
    const { reply, raw, done } = mockReply();
    await dispatcher.proxyOllama(mockRequest({ model: 'llama3.2', stream: false }), reply, {
      endpoint: '/api/chat',
      model: 'llama3.2',
      clientKeyId: null,
    });
    await done;
    expect(raw.statusCode).toBe(200);
    expect(raw.body()).toContain('hi from');
  });

  it('distributes load across nodes (round-robin)', async () => {
    for (let i = 0; i < 6; i++) {
      const { reply, done } = mockReply();
      await dispatcher.proxyOllama(mockRequest({ model: 'llama3.2', stream: false }), reply, {
        endpoint: '/api/chat',
        model: 'llama3.2',
        clientKeyId: null,
      });
      await done;
    }
    expect(a.count()).toBeGreaterThan(0);
    expect(b.count()).toBeGreaterThan(0);
  });

  it('fails over when a candidate node is unreachable', async () => {
    const dead = registry.upsert(fakeRow(ID_DEAD, 1)); // port 1 → connection refused
    dead.runtime.status = 'up';
    dead.runtime.models = ['llama3.2'];
    const { reply, raw, done } = mockReply();
    await dispatcher.proxyOllama(mockRequest({ model: 'llama3.2', stream: false }), reply, {
      endpoint: '/api/chat',
      model: 'llama3.2',
      clientKeyId: null,
    });
    await done;
    expect(raw.statusCode).toBe(200);
    registry.remove(ID_DEAD);
  });

  it('falls back /api/embed → /api/embeddings when the node 404s (legacy Ollama)', async () => {
    const { reply, raw, done } = mockReply();
    await dispatcher.proxyOllama(
      mockRequest({ model: 'llama3.2', input: 'hello' }, '/api/embed'),
      reply,
      { endpoint: '/api/embed', model: 'llama3.2', clientKeyId: null },
    );
    await done;
    // The mock 404s /api/embed but serves /api/embeddings; the dispatcher
    // translates and returns an /api/embed-shaped 200.
    expect(raw.statusCode).toBe(200);
    const body = JSON.parse(raw.body()) as { embeddings: number[][] };
    expect(body.embeddings).toEqual([[0.1, 0.2, 0.3]]);
  });

  it('throws when no healthy nodes are available', async () => {
    const empty = new Dispatcher(new NodeRegistry(db), new RealtimeHub(), recorder, () => settings);
    const { reply } = mockReply();
    await expect(
      empty.proxyOllama(mockRequest({ model: 'llama3.2' }), reply, {
        endpoint: '/api/chat',
        model: 'llama3.2',
        clientKeyId: null,
      }),
    ).rejects.toThrow();
  });
});

describe('Dispatcher hard concurrency cap', () => {
  const settings: Settings = {
    strategy: 'least-connections',
    modelAware: true,
    contextAware: false,
    autoPull: false,
    failoverRetries: 0,
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
  const recorder = { record: async () => {} } as unknown as AnalyticsRecorder;

  it('never exceeds a node maxConcurrency, queueing the rest until a slot frees', async () => {
    const slow = await startMockOllama({ label: 'slow', delayMs: 80 });
    const reg = new NodeRegistry(db);
    const node = reg.upsert(fakeRow('44444444-4444-4444-4444-444444444444', slow.port));
    node.runtime.status = 'up';
    node.runtime.models = ['llama3.2'];
    node.maxConcurrency = 1; // hard cap of one in-flight request
    const disp = new Dispatcher(reg, new RealtimeHub(), recorder, () => settings);

    // Fire three at once: with maxConcurrency=1 they must serialise, not pile on.
    const replies = [mockReply(), mockReply(), mockReply()];
    await Promise.all(
      replies.map((r) =>
        disp.proxyOllama(mockRequest({ model: 'llama3.2', stream: false }), r.reply, {
          endpoint: '/api/chat',
          model: 'llama3.2',
          clientKeyId: null,
        }),
      ),
    );
    await Promise.all(replies.map((r) => r.done));

    expect(slow.count()).toBe(3);
    expect(slow.maxConcurrent()).toBe(1); // the node never saw 2+ at once
    expect(node.runtime.inFlight).toBe(0); // every reserved slot released
    for (const r of replies) expect(r.raw.statusCode).toBe(200);
    await slow.close();
  });
});

describe('parseEmbedRequest', () => {
  const buf = (o: unknown): Buffer => Buffer.from(JSON.stringify(o));
  it('normalizes a string input to a one-item list', () => {
    expect(parseEmbedRequest(buf({ model: 'm', input: 'hi' }))).toEqual({
      model: 'm',
      inputs: ['hi'],
    });
  });
  it('keeps an array input', () => {
    expect(parseEmbedRequest(buf({ model: 'm', input: ['a', 'b'] }))).toEqual({
      model: 'm',
      inputs: ['a', 'b'],
    });
  });
  it('returns null when unusable', () => {
    expect(parseEmbedRequest(buf({ input: 'hi' }))).toBeNull(); // no model
    expect(parseEmbedRequest(buf({ model: 'm' }))).toBeNull(); // no input
    expect(parseEmbedRequest(buf({ model: 'm', input: [] }))).toBeNull(); // empty
    expect(parseEmbedRequest(undefined)).toBeNull();
    expect(parseEmbedRequest(Buffer.from('not json'))).toBeNull();
  });
});
