import { describe, expect, it } from 'vitest';
import { db } from '../src/db/client';
import { NodeRegistry } from '../src/orchestrator/registry';
import type { NodeRow } from '../src/db/schema';

function row(id: string, maxConcurrency: number): NodeRow {
  return {
    id,
    name: id,
    host: '127.0.0.1',
    port: 11434,
    protocol: 'http',
    weight: 1,
    enabled: true,
    maxConcurrency,
    tags: [],
    agentPort: null,
    enabledModels: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as NodeRow;
}

const ID = '11111111-1111-1111-1111-111111111111';

describe('NodeRegistry concurrency gate', () => {
  it('tryReserve enforces maxConcurrency as a hard cap', () => {
    const reg = new NodeRegistry(db);
    const n = reg.upsert(row(ID, 2));
    expect(reg.tryReserve(n.id)).toBe(true);
    expect(reg.tryReserve(n.id)).toBe(true);
    expect(reg.tryReserve(n.id)).toBe(false); // at cap → refused, no increment
    expect(n.runtime.inFlight).toBe(2);
    reg.decInFlight(n.id);
    expect(reg.tryReserve(n.id)).toBe(true); // a slot freed
    expect(reg.tryReserve('unknown-id')).toBe(false);
  });

  it('waitForSlot resolves when a slot is released', async () => {
    const reg = new NodeRegistry(db);
    const n = reg.upsert(row(ID, 1));
    expect(reg.tryReserve(n.id)).toBe(true);
    let woke = false;
    const waiting = reg.waitForSlot(5000).then(() => {
      woke = true;
    });
    await Promise.resolve();
    expect(woke).toBe(false); // still full → keeps waiting
    reg.decInFlight(n.id); // releasing a slot wakes the waiter
    await waiting;
    expect(woke).toBe(true);
  });

  it('waitForSlot resolves on timeout even without a release', async () => {
    const reg = new NodeRegistry(db);
    await reg.waitForSlot(10); // re-poll safety net — resolves, no hang
  });
});
