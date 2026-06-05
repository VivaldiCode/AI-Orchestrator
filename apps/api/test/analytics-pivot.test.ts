import { describe, expect, it } from 'vitest';
import { pivotNodeSeries } from '../src/analytics/queries';

describe('pivotNodeSeries', () => {
  it('pivots per-node bucket rows into stacked points, zero-filling gaps', () => {
    const { points, keys } = pivotNodeSeries([
      { bucket: '2026-06-05T10:00:00.000Z', node: 'a', requests: 3 },
      { bucket: '2026-06-05T10:00:00.000Z', node: 'b', requests: 1 },
      { bucket: '2026-06-05T10:01:00.000Z', node: 'a', requests: 2 },
    ]);
    expect(keys).toEqual(['a', 'b']);
    expect(points).toEqual([
      { time: '2026-06-05T10:00:00.000Z', a: 3, b: 1 },
      { time: '2026-06-05T10:01:00.000Z', a: 2, b: 0 },
    ]);
  });

  it('handles empty input', () => {
    expect(pivotNodeSeries([])).toEqual({ points: [], keys: [] });
  });

  it('accepts Date buckets and groups by ISO time', () => {
    const { points } = pivotNodeSeries([
      { bucket: new Date('2026-06-05T10:00:00.000Z'), node: 'cloud', requests: 5 },
    ]);
    expect(points[0]).toEqual({ time: '2026-06-05T10:00:00.000Z', cloud: 5 });
  });
});
