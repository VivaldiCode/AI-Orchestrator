import type { NodePerf, NodeRuntime } from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { nodes as nodesTable, type NodeRow } from '../db/schema';
import { freshRuntime, toNodeRuntime, type ManagedNode, type RuntimeState } from './types';

function rowToManaged(row: NodeRow, runtime: RuntimeState): ManagedNode {
  return {
    id: row.id,
    name: row.name,
    host: row.host,
    port: row.port,
    protocol: row.protocol === 'https' ? 'https' : 'http',
    weight: row.weight,
    enabled: row.enabled,
    maxConcurrency: row.maxConcurrency,
    tags: row.tags ?? [],
    agentPort: row.agentPort ?? null,
    enabledModels: row.enabledModels ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    runtime,
  };
}

/**
 * In-memory view of all nodes with their live runtime state. Persisted node
 * data lives in Postgres; this keeps the hot path allocation-free and fast.
 */
export class NodeRegistry {
  private readonly map = new Map<string, ManagedNode>();
  /** Resolvers waiting for a concurrency slot to free (see waitForSlot). */
  private readonly slotWaiters = new Set<() => void>();

  constructor(private readonly db: DB) {}

  /** (Re)load nodes from the database, preserving runtime state for known ids. */
  async load(): Promise<void> {
    const rows = await this.db.select().from(nodesTable);
    const seen = new Set<string>();
    for (const row of rows) {
      seen.add(row.id);
      const existing = this.map.get(row.id);
      this.map.set(row.id, rowToManaged(row, existing?.runtime ?? freshRuntime()));
    }
    for (const id of [...this.map.keys()]) {
      if (!seen.has(id)) this.map.delete(id);
    }
  }

  /** Insert/update a single node from a DB row (after a CRUD operation). */
  upsert(row: NodeRow): ManagedNode {
    const existing = this.map.get(row.id);
    const managed = rowToManaged(row, existing?.runtime ?? freshRuntime());
    this.map.set(row.id, managed);
    return managed;
  }

  remove(id: string): void {
    this.map.delete(id);
  }

  get(id: string): ManagedNode | undefined {
    return this.map.get(id);
  }

  list(): ManagedNode[] {
    return [...this.map.values()];
  }

  listEnabled(): ManagedNode[] {
    return this.list().filter((n) => n.enabled);
  }

  // --- runtime mutations (hot path) ----------------------------------------

  incInFlight(id: string): void {
    const n = this.map.get(id);
    if (n) n.runtime.inFlight++;
  }

  decInFlight(id: string): void {
    const n = this.map.get(id);
    if (n) n.runtime.inFlight = Math.max(0, n.runtime.inFlight - 1);
    this.wakeSlotWaiters();
  }

  /**
   * Atomically reserve a concurrency slot on a node, honouring `maxConcurrency`
   * as a HARD cap: returns false (without incrementing) when the node is already
   * at capacity or unknown. Node's single-threaded event loop makes the
   * check-then-increment atomic, so dispatch never exceeds the cap. The caller
   * owns exactly one matching decInFlight once the request finishes.
   */
  tryReserve(id: string): boolean {
    const n = this.map.get(id);
    if (!n) return false;
    if (n.runtime.inFlight >= n.maxConcurrency) return false;
    n.runtime.inFlight++;
    return true;
  }

  /** Wake everyone waiting on waitForSlot — a slot may have just opened up. */
  private wakeSlotWaiters(): void {
    if (this.slotWaiters.size === 0) return;
    const waiters = [...this.slotWaiters];
    this.slotWaiters.clear();
    for (const resolve of waiters) resolve();
  }

  /**
   * Resolve when a concurrency slot is released, or after `timeoutMs` as a
   * re-poll safety net. Used by the dispatcher to wait for a free node instead
   * of overloading one when every candidate is at capacity.
   */
  waitForSlot(timeoutMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = (): void => {
        this.slotWaiters.delete(done);
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, timeoutMs);
      this.slotWaiters.add(done);
    });
  }

  recordSuccess(id: string): void {
    const n = this.map.get(id);
    if (n) n.runtime.totalRequests++;
  }

  recordError(id: string): void {
    const n = this.map.get(id);
    if (!n) return;
    n.runtime.totalRequests++;
    n.runtime.totalErrors++;
    if (n.runtime.status === 'up') n.runtime.status = 'degraded';
  }

  /** Replace each node's measured performance stats (from the analytics refresh). */
  setPerformance(perfById: Map<string, NodePerf>): void {
    for (const n of this.map.values()) {
      n.runtime.perf = perfById.get(n.id) ?? null;
    }
  }

  snapshot(): NodeRuntime[] {
    return this.list().map(toNodeRuntime);
  }
}
