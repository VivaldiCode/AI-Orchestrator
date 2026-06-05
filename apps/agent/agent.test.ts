import { describe, expect, it } from 'vitest';
import { computeCpuUsage } from './agent.mjs';

describe('agent CPU usage', () => {
  it('derives busy fraction from idle/total deltas', () => {
    expect(computeCpuUsage({ idle: 0, total: 0 }, { idle: 75, total: 100 })).toBeCloseTo(0.25);
    expect(computeCpuUsage({ idle: 0, total: 0 }, { idle: 0, total: 100 })).toBe(1);
  });

  it('returns 0 when there is no movement', () => {
    expect(computeCpuUsage({ idle: 100, total: 200 }, { idle: 100, total: 200 })).toBe(0);
  });

  it('clamps to 0..1', () => {
    expect(computeCpuUsage({ idle: 0, total: 0 }, { idle: -10, total: 100 })).toBeLessThanOrEqual(
      1,
    );
    expect(
      computeCpuUsage({ idle: 50, total: 0 }, { idle: 100, total: 50 }),
    ).toBeGreaterThanOrEqual(0);
  });
});
