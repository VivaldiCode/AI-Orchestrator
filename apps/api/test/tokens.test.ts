import { describe, expect, it } from 'vitest';
import { estimateRequestTokens, estimateTokens } from '../src/orchestrator/tokens';

describe('token estimation', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('a'.repeat(40))).toBe(10);
  });

  it('estimates chat messages with per-message overhead', () => {
    const tokens = estimateRequestTokens({
      messages: [
        { role: 'system', content: 'a'.repeat(40) },
        { role: 'user', content: 'b'.repeat(40) },
      ],
    });
    // (40 + 8) * 2 = 96 chars → 24 tokens
    expect(tokens).toBe(24);
  });

  it('estimates generate prompts', () => {
    expect(estimateRequestTokens({ prompt: 'x'.repeat(400) })).toBe(100);
  });

  it('handles multimodal content arrays and empty bodies', () => {
    expect(estimateRequestTokens(null)).toBe(0);
    expect(
      estimateRequestTokens({
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }),
    ).toBeGreaterThan(0);
  });
});
