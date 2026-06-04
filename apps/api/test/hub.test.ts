import { describe, expect, it } from 'vitest';
import { RealtimeHub, type RealtimeClient } from '../src/realtime/hub';

function mockClient(): RealtimeClient & { messages: string[]; isClosed: boolean } {
  const messages: string[] = [];
  return {
    messages,
    isClosed: false,
    send(data: string) {
      messages.push(data);
    },
    get closed() {
      return this.isClosed;
    },
  };
}

describe('RealtimeHub', () => {
  it('sends a snapshot to new clients on join', () => {
    const hub = new RealtimeHub();
    hub.setSnapshotProvider(() => ({ type: 'snapshot', nodes: [], at: '2026-01-01T00:00:00Z' }));
    const client = mockClient();
    hub.add(client);
    expect(client.messages).toHaveLength(1);
    expect(JSON.parse(client.messages[0]).type).toBe('snapshot');
  });

  it('broadcasts events to connected clients', () => {
    const hub = new RealtimeHub();
    const a = mockClient();
    const b = mockClient();
    hub.add(a);
    hub.add(b);
    hub.broadcast({ type: 'node:metrics', nodes: [], at: '2026-01-01T00:00:00Z' });
    expect(a.messages).toHaveLength(1);
    expect(b.messages).toHaveLength(1);
    expect(hub.size).toBe(2);
  });

  it('prunes closed clients on broadcast', () => {
    const hub = new RealtimeHub();
    const client = mockClient();
    hub.add(client);
    client.isClosed = true;
    hub.broadcast({ type: 'node:metrics', nodes: [], at: '2026-01-01T00:00:00Z' });
    expect(hub.size).toBe(0);
  });
});
