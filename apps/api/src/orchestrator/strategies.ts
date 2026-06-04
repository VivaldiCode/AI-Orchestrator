import type { Strategy } from '@ai-orchestrator/shared';
import type { ManagedNode } from './types';

/**
 * Pure load-balancing strategies. Each picks one node from a list of healthy
 * candidates. All are deterministic (stable tie-break by id) so they are easy
 * to unit-test.
 */

function minBy(nodes: ManagedNode[], score: (n: ManagedNode) => number): ManagedNode | null {
  if (nodes.length === 0) return null;
  let best = nodes[0];
  let bestScore = score(best);
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i];
    const s = score(n);
    if (s < bestScore || (s === bestScore && n.id < best.id)) {
      best = n;
      bestScore = s;
    }
  }
  return best;
}

export function roundRobin(nodes: ManagedNode[], counter: number): ManagedNode | null {
  if (nodes.length === 0) return null;
  // Sort by id for a stable rotation order regardless of map iteration order.
  const ordered = [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1));
  const index = ((counter % ordered.length) + ordered.length) % ordered.length;
  return ordered[index];
}

export function leastConnections(nodes: ManagedNode[]): ManagedNode | null {
  return minBy(nodes, (n) => n.runtime.inFlight);
}

export function leastLatency(nodes: ManagedNode[]): ManagedNode | null {
  return minBy(nodes, (n) => n.runtime.latencyMs ?? Number.POSITIVE_INFINITY);
}

/**
 * Weight-proportional least-connections: a node with weight W can take W times
 * the load before it is considered as busy as a weight-1 node. This honours the
 * configured weights while still reacting to live load.
 */
export function weighted(nodes: ManagedNode[]): ManagedNode | null {
  return minBy(nodes, (n) => n.runtime.inFlight / Math.max(1, n.weight));
}

export function selectNode(
  strategy: Strategy,
  candidates: ManagedNode[],
  roundRobinCounter: number,
): ManagedNode | null {
  switch (strategy) {
    case 'round-robin':
      return roundRobin(candidates, roundRobinCounter);
    case 'least-connections':
      return leastConnections(candidates);
    case 'least-latency':
      return leastLatency(candidates);
    case 'weighted':
      return weighted(candidates);
    default:
      return leastConnections(candidates);
  }
}
