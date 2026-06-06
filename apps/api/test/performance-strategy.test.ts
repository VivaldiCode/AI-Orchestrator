import { describe, expect, it } from 'vitest';
import type { NodePerf } from '@ai-orchestrator/shared';
import { performanceAware, selectNode } from '../src/orchestrator/strategies';
import { freshRuntime, type ManagedNode } from '../src/orchestrator/types';

function node(
  id: string,
  opts: { msPerToken?: number; avgLatencyMs?: number; inFlight?: number; measured?: boolean } = {},
): ManagedNode {
  const measured = opts.measured ?? opts.msPerToken !== undefined;
  const perf: NodePerf | null = measured
    ? {
        samples: 100,
        avgLatencyMs: opts.avgLatencyMs ?? 1000,
        tokensPerSecond: opts.msPerToken ? 1000 / opts.msPerToken : null,
        msPerToken: opts.msPerToken ?? null,
        windowHours: 24,
      }
    : null;
  return {
    id,
    name: id,
    weight: 1,
    maxConcurrency: 100,
    runtime: { ...freshRuntime(), inFlight: opts.inFlight ?? 0, perf },
  } as unknown as ManagedNode;
}

describe('performanceAware strategy', () => {
  it('sends a large request to the fastest machine (lowest ms/token)', () => {
    const fast = node('a-fast', { msPerToken: 2 });
    const mid = node('b-mid', { msPerToken: 5 });
    const slow = node('c-slow', { msPerToken: 10 });
    expect(performanceAware([slow, mid, fast], 1000)?.id).toBe('a-fast');
  });

  it('balances a small request by load even if a node is faster per token', () => {
    // Fast per token but busy vs. a slightly slower idle node.
    const fastBusy = node('fast', { msPerToken: 2, avgLatencyMs: 500, inFlight: 5 });
    const idle = node('idle', { msPerToken: 5, avgLatencyMs: 1000, inFlight: 0 });
    // Small/unknown-size request (0 tokens) → idle wins (clears sooner).
    expect(performanceAware([fastBusy, idle], 0)?.id).toBe('idle');
  });

  it('still routes to (and samples) a node without measured data', () => {
    const slowBusy = node('slow', { msPerToken: 10, avgLatencyMs: 2000, inFlight: 3 });
    const fresh = node('new', { measured: false });
    expect(performanceAware([slowBusy, fresh], 1000)?.id).toBe('new');
  });

  it('returns null for an empty pool', () => {
    expect(performanceAware([], 100)).toBeNull();
  });

  it('selectNode dispatches the performance strategy with estimated tokens', () => {
    const fast = node('a-fast', { msPerToken: 2 });
    const slow = node('z-slow', { msPerToken: 20 });
    expect(selectNode('performance', [slow, fast], 0, 1000)?.id).toBe('a-fast');
  });
});
