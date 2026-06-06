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

// Neutral fallbacks used until a node (or the fleet) has measured data.
const DEFAULT_MS_PER_TOKEN = 8;
const DEFAULT_REQUEST_MS = 1000;

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/**
 * Performance-aware: route by *predicted completion time* using each node's
 * measured speed over the last 24h (ms/token + avg completion) and its current
 * in-flight backlog:
 *
 *   score(node) = inFlight · avgRequestTime   (time to clear the backlog)
 *               + estimatedTokens · msPerToken (this request's generation time)
 *
 * The fastest machine wins big requests; small/unknown-size requests fall back
 * to the avg request time and get balanced by load. Nodes without data borrow
 * the fleet average so they still receive (and get sampled by) traffic. This is
 * what compensates a mixed fleet (e.g. M5 vs M3 Max vs M3).
 */
export function performanceAware(
  nodes: ManagedNode[],
  estimatedTokens: number,
): ManagedNode | null {
  if (nodes.length === 0) return null;
  const tokenRates = nodes
    .map((n) => n.runtime.perf?.msPerToken)
    .filter((v): v is number => v != null);
  const reqTimes = nodes
    .map((n) => n.runtime.perf?.avgLatencyMs)
    .filter((v): v is number => v != null);
  const fleetMsPerToken = tokenRates.length ? mean(tokenRates) : DEFAULT_MS_PER_TOKEN;
  const fleetReqMs = reqTimes.length ? mean(reqTimes) : DEFAULT_REQUEST_MS;

  return minBy(nodes, (n) => {
    const perf = n.runtime.perf;
    const msPerToken = perf?.msPerToken ?? fleetMsPerToken;
    const avgReqMs = perf?.avgLatencyMs ?? fleetReqMs;
    const serviceMs = estimatedTokens > 0 ? estimatedTokens * msPerToken : avgReqMs;
    const queueMs = n.runtime.inFlight * avgReqMs;
    return queueMs + serviceMs;
  });
}

export function selectNode(
  strategy: Strategy,
  candidates: ManagedNode[],
  roundRobinCounter: number,
  estimatedTokens = 0,
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
    case 'performance':
      return performanceAware(candidates, estimatedTokens);
    default:
      return leastConnections(candidates);
  }
}
