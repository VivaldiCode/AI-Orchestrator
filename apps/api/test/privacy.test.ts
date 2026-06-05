import { describe, expect, it } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { consumeLocalOnly } from '../src/routes/shared';

function fakeReq(opts: { headers?: Record<string, string>; body?: unknown }): FastifyRequest {
  const body = opts.body === undefined ? undefined : Buffer.from(JSON.stringify(opts.body));
  return { headers: opts.headers ?? {}, body } as unknown as FastifyRequest;
}

describe('consumeLocalOnly', () => {
  it('detects the header (1 or true)', () => {
    expect(consumeLocalOnly(fakeReq({ headers: { 'x-ai-orchestrator-local-only': '1' } }))).toBe(
      true,
    );
    expect(consumeLocalOnly(fakeReq({ headers: { 'x-local-only': 'true' } }))).toBe(true);
  });

  it('detects and strips the body flag, preserving other fields', () => {
    const req = fakeReq({ body: { model: 'llama3.1', local_only: true, messages: [] } });
    expect(consumeLocalOnly(req)).toBe(true);
    const after = JSON.parse((req.body as Buffer).toString('utf8'));
    expect(after.local_only).toBeUndefined();
    expect(after.model).toBe('llama3.1');
    expect(after.messages).toEqual([]);
  });

  it('accepts the privacy:true alias and strips it', () => {
    const req = fakeReq({ body: { privacy: true, prompt: 'hi' } });
    expect(consumeLocalOnly(req)).toBe(true);
    expect(JSON.parse((req.body as Buffer).toString('utf8')).privacy).toBeUndefined();
  });

  it('returns false when absent', () => {
    expect(consumeLocalOnly(fakeReq({ body: { model: 'x' } }))).toBe(false);
    expect(consumeLocalOnly(fakeReq({}))).toBe(false);
  });
});
