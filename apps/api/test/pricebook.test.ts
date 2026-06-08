import { describe, expect, it } from 'vitest';
import type { DB } from '../src/db/client';
import { PriceBook } from '../src/cost/pricebook';

function book() {
  const pb = new PriceBook(null as unknown as DB);
  pb.replace([
    { provider: 'openai', model: 'gpt-4o-mini', inputPerMtok: 0.15, outputPerMtok: 0.6 },
    { provider: 'openai', model: '*', inputPerMtok: 0.5, outputPerMtok: 1.5 },
    { provider: 'ollama', model: '*', inputPerMtok: 0, outputPerMtok: 0 },
  ]);
  return pb;
}

describe('PriceBook.costOf', () => {
  it('uses the exact (provider, model) rate', () => {
    // 1000 in * 0.15/M + 2000 out * 0.6/M
    expect(book().costOf('openai', 'gpt-4o-mini', 1000, 2000)).toBeCloseTo(0.00015 + 0.0012, 9);
  });

  it('falls back to the provider * default', () => {
    expect(book().costOf('openai', 'unknown-model', 1_000_000, 0)).toBeCloseTo(0.5, 9);
  });

  it('returns 0 for the local provider (zero rates)', () => {
    expect(book().costOf('ollama', 'llama3.2', 5000, 5000)).toBe(0);
  });

  it('returns 0 when no price and no provider default exists', () => {
    expect(book().costOf('mistral', 'foo', 1000, 1000)).toBe(0);
  });

  it('treats null token counts as 0', () => {
    expect(book().costOf('openai', 'gpt-4o-mini', null, null)).toBe(0);
  });
});
