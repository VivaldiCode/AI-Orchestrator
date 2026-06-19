import { describe, expect, it } from 'vitest';
import { AnalyticsRecorder } from '../src/analytics/recorder';
import type { DB } from '../src/db/client';
import type { PriceBook } from '../src/cost/pricebook';

/**
 * Recorder with a captured-row fake DB and a price book that only prices the
 * cloud substitute model — so we can prove cost is attributed to the model the
 * provider actually served, not the local alias the client asked for.
 */
function stubRecorder() {
  const rows: Record<string, unknown>[] = [];
  const db = {
    insert: () => ({
      values: (v: Record<string, unknown>) => {
        rows.push(v);
        return Promise.resolve();
      },
    }),
  } as unknown as DB;
  const prices = {
    costOf: (_p: string, model: string, pt: number | null, ct: number | null) =>
      model === 'grok-2-latest' ? ((pt ?? 0) + (ct ?? 0)) * 0.001 : null,
  } as unknown as PriceBook;
  return { rec: new AnalyticsRecorder(db, prices), rows };
}

describe('AnalyticsRecorder', () => {
  it('stores the substitute target model and prices by it (not the local alias)', async () => {
    const { rec, rows } = stubRecorder();
    await rec.record({
      requestId: 'r1',
      nodeId: null,
      provider: 'xai',
      model: 'gemma4:26b', // what the client asked for (unpriced locally)
      targetModel: 'grok-2-latest', // what xAI actually served
      endpoint: '/api/chat',
      status: 200,
      latencyMs: 10,
      promptTokens: 100,
      completionTokens: 100,
      error: null,
      clientKeyId: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('gemma4:26b'); // client-facing model preserved
    expect(rows[0].targetModel).toBe('grok-2-latest');
    expect(rows[0].costUsd).toBeCloseTo(0.2); // priced by the target, not the alias
  });

  it('defaults targetModel to null and prices by the asked model when unsubstituted', async () => {
    const { rec, rows } = stubRecorder();
    await rec.record({
      requestId: 'r2',
      nodeId: 'n1',
      provider: 'ollama',
      model: 'grok-2-latest', // (priced) — no substitution happened
      endpoint: '/api/chat',
      status: 200,
      latencyMs: 5,
      promptTokens: 10,
      completionTokens: 0,
      error: null,
      clientKeyId: null,
    });
    expect(rows[0].targetModel).toBeNull();
    expect(rows[0].costUsd).toBeCloseTo(0.01);
  });
});
