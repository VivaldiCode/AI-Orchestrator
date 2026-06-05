import { describe, expect, it } from 'vitest';
import type { NodeStatus } from '@ai-orchestrator/shared';
import {
  leastConnections,
  leastLatency,
  roundRobin,
  selectNode,
  weighted,
} from '../src/orchestrator/strategies';
import { freshRuntime, type ManagedNode } from '../src/orchestrator/types';

function mkNode(
  id: string,
  opts: { inFlight?: number; latencyMs?: number | null; weight?: number; status?: NodeStatus } = {},
): ManagedNode {
  return {
    id,
    name: id,
    host: '127.0.0.1',
    port: 11434,
    protocol: 'http',
    weight: opts.weight ?? 1,
    enabled: true,
    maxConcurrency: 4,
    tags: [],
    agentPort: null,
    createdAt: '',
    updatedAt: '',
    runtime: {
      ...freshRuntime(),
      status: opts.status ?? 'up',
      inFlight: opts.inFlight ?? 0,
      latencyMs: opts.latencyMs ?? null,
    },
  };
}

describe('load-balancing strategies', () => {
  it('round-robin rotates deterministically by id order', () => {
    const nodes = [mkNode('b'), mkNode('a')];
    expect(roundRobin(nodes, 0)?.id).toBe('a');
    expect(roundRobin(nodes, 1)?.id).toBe('b');
    expect(roundRobin(nodes, 2)?.id).toBe('a');
  });

  it('least-connections picks the fewest in-flight', () => {
    const nodes = [
      mkNode('a', { inFlight: 3 }),
      mkNode('b', { inFlight: 1 }),
      mkNode('c', { inFlight: 2 }),
    ];
    expect(leastConnections(nodes)?.id).toBe('b');
  });

  it('least-latency picks the lowest latency, treating null as worst', () => {
    const nodes = [
      mkNode('a', { latencyMs: 120 }),
      mkNode('b', { latencyMs: 40 }),
      mkNode('c', { latencyMs: null }),
    ];
    expect(leastLatency(nodes)?.id).toBe('b');
  });

  it('weighted favours higher-capacity nodes (inFlight / weight)', () => {
    const nodes = [
      mkNode('a', { inFlight: 2, weight: 1 }),
      mkNode('b', { inFlight: 2, weight: 4 }),
    ];
    expect(weighted(nodes)?.id).toBe('b');
  });

  it('returns null when there are no candidates', () => {
    expect(selectNode('least-connections', [], 0)).toBeNull();
    expect(roundRobin([], 0)).toBeNull();
  });

  it('selectNode dispatches to the right strategy', () => {
    const nodes = [mkNode('a', { inFlight: 5 }), mkNode('b', { inFlight: 0 })];
    expect(selectNode('least-connections', nodes, 0)?.id).toBe('b');
    expect(selectNode('round-robin', nodes, 0)?.id).toBe('a');
  });
});
