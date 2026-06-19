import type { RealtimeEvent } from '@ai-orchestrator/shared';

/** Minimal transport abstraction so the hub does not depend on Fastify/ws. */
export interface RealtimeClient {
  send(data: string): void;
  readonly closed: boolean;
}

/**
 * Fan-out hub for dashboard realtime events. Connected clients receive a
 * snapshot immediately on join, then every broadcast event.
 */
export class RealtimeHub {
  private readonly clients = new Set<RealtimeClient>();
  private snapshotProvider: (() => RealtimeEvent) | null = null;
  /** Live in-flight request count per provider, derived from start/end events. */
  private readonly inFlight = new Map<string, number>();

  setSnapshotProvider(fn: () => RealtimeEvent): void {
    this.snapshotProvider = fn;
  }

  /** Current in-flight request count for a provider (e.g. `openai`, `xai`). */
  inFlightFor(provider: string): number {
    return this.inFlight.get(provider) ?? 0;
  }

  add(client: RealtimeClient): void {
    this.clients.add(client);
    if (this.snapshotProvider) {
      try {
        client.send(JSON.stringify(this.snapshotProvider()));
      } catch {
        this.clients.delete(client);
      }
    }
  }

  remove(client: RealtimeClient): void {
    this.clients.delete(client);
  }

  broadcast(event: RealtimeEvent): void {
    // Track per-provider in-flight: every dispatch path emits start/end here.
    if (event.type === 'request:start' && event.provider) {
      this.inFlight.set(event.provider, this.inFlightFor(event.provider) + 1);
    } else if (event.type === 'request:end' && event.provider) {
      this.inFlight.set(event.provider, Math.max(0, this.inFlightFor(event.provider) - 1));
    }
    const data = JSON.stringify(event);
    for (const c of this.clients) {
      if (c.closed) {
        this.clients.delete(c);
        continue;
      }
      try {
        c.send(data);
      } catch {
        this.clients.delete(c);
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}
