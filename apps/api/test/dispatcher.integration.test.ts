import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import type { AnalyticsRecorder } from '../src/analytics/recorder';
import { db } from '../src/db/client';
import type { NodeRow } from '../src/db/schema';
import { Dispatcher } from '../src/orchestrator/dispatcher';
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

function mockRequest(body: unknown): FastifyRequest {
  return {
    method: 'POST',
    url: '/api/chat',
    headers: { 'content-type': 'application/json' },
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
