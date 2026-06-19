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

  it('tracks in-flight per provider from start/end events', () => {
    const hub = new RealtimeHub();
    const start = (provider: string) =>
      hub.broadcast({
        type: 'request:start',
        id: 'r',
        nodeId: null,
        provider,
        model: 'm',
        endpoint: '/v1/chat/completions',
        clientIp: null,
        at: '2026-01-01T00:00:00Z',
      });
    const end = (provider: string) =>
      hub.broadcast({
        type: 'request:end',
        id: 'r',
        nodeId: null,
        provider,
        model: 'm',
        endpoint: '/v1/chat/completions',
        status: 200,
        latencyMs: 10,
        promptTokens: null,
        completionTokens: null,
        clientIp: null,
        at: '2026-01-01T00:00:00Z',
      });
    start('openai');
    start('openai');
    start('xai');
    expect(hub.inFlightFor('openai')).toBe(2);
    expect(hub.inFlightFor('xai')).toBe(1);
    end('openai');
    expect(hub.inFlightFor('openai')).toBe(1);
    end('openai');
    end('openai'); // never goes negative
    expect(hub.inFlightFor('openai')).toBe(0);
  });
});
