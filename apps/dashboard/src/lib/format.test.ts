import { describe, expect, it } from 'vitest';
import { formatLatency, formatNumber, formatPercent, formatRelativeTime } from './format';

describe('format utils', () => {
  it('formats latency', () => {
    expect(formatLatency(null)).toBe('—');
    expect(formatLatency(450)).toBe('450 ms');
    expect(formatLatency(2500)).toBe('2.50 s');
  });

  it('formats numbers and percents', () => {
    expect(formatNumber(12345)).toBe('12,345');
    expect(formatNumber(null)).toBe('—');
    expect(formatPercent(0.1234)).toBe('12.3%');
  });

  it('formats relative time', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(formatRelativeTime(null, now)).toBe('never');
    expect(formatRelativeTime('2026-01-01T00:00:00Z', now)).toBe('just now');
    expect(formatRelativeTime('2025-12-31T23:59:00Z', now)).toBe('1m ago');
    expect(formatRelativeTime('2025-12-31T22:00:00Z', now)).toBe('2h ago');
  });
});
