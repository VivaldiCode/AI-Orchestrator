import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RequestArchive, sanitizeHeaders } from '../src/archive/index';

function input(id: string, at: string) {
  return {
    id,
    at,
    method: 'POST',
    endpoint: '/api/chat',
    model: 'llama3.2',
    provider: 'ollama',
    nodeId: 'n1',
    nodeName: 'mac',
    clientIp: '1.2.3.4',
    clientKeyId: null,
    status: 200,
    latencyMs: 123,
    promptTokens: 5,
    completionTokens: 7,
    requestHeaders: { 'content-type': 'application/json' },
  };
}

describe('RequestArchive', () => {
  let dir: string;
  let archive: RequestArchive;
  const at = '2026-06-06T10:00:00.000Z';
  const date = '2026-06-06';

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'aio-archive-'));
    archive = new RequestArchive({ enabled: true, dir, maxBytes: 1000, retentionDays: 0 });
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('records an exchange and lists it back', async () => {
    await archive.record(input('req_one', at), '{"prompt":"hi"}', 'hello there');
    const list = await archive.list({ limit: 10, offset: 0 });
    expect(list.date).toBe(date);
    expect(list.total).toBe(1);
    expect(list.items[0].id).toBe('req_one');
    expect(list.items[0].endpoint).toBe('/api/chat');
    expect(list.items[0].promptTokens).toBe(5);
    expect(list.items[0].requestBytes).toBe('{"prompt":"hi"}'.length);
  });

  it('stores and returns the raw request + response bodies', async () => {
    const req = await archive.readBody(date, 'req_one', 'request');
    const res = await archive.readBody(date, 'req_one', 'response');
    expect(req?.toString('utf8')).toBe('{"prompt":"hi"}');
    expect(res?.toString('utf8')).toBe('hello there');
    const meta = await archive.readMeta(date, 'req_one');
    expect(meta?.nodeName).toBe('mac');
    expect(meta?.requestTruncated).toBe(false);
  });

  it('caps bodies at maxBytes and flags truncation', async () => {
    const big = 'x'.repeat(5000);
    await archive.record(input('req_big', at), big, big);
    const meta = await archive.readMeta(date, 'req_big');
    expect(meta?.requestBytes).toBe(5000);
    expect(meta?.requestTruncated).toBe(true);
    const body = await archive.readBody(date, 'req_big', 'request');
    expect(body?.length).toBe(1000);
  });

  it('is a no-op when disabled', async () => {
    const off = new RequestArchive({ enabled: false, dir, maxBytes: 0, retentionDays: 0 });
    await off.record(input('req_off', at), 'x', 'y');
    expect(await off.readMeta(date, 'req_off')).toBeNull();
  });

  it('rejects path-traversal in date/id', async () => {
    expect(await archive.readBody('../etc', 'req_one', 'request')).toBeNull();
    expect(await archive.readBody(date, '../../secret', 'request')).toBeNull();
  });
});

describe('sanitizeHeaders', () => {
  it('drops secrets and flattens arrays', () => {
    const out = sanitizeHeaders({
      authorization: 'Bearer secret',
      cookie: 'a=b',
      'content-type': 'application/json',
      'x-multi': ['a', 'b'],
      missing: undefined,
    });
    expect(out.authorization).toBeUndefined();
    expect(out.cookie).toBeUndefined();
    expect(out['content-type']).toBe('application/json');
    expect(out['x-multi']).toBe('a, b');
    expect('missing' in out).toBe(false);
  });
});
