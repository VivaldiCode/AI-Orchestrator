import { create } from 'zustand';
import type { NodeRuntime, RealtimeEvent } from '@ai-orchestrator/shared';

export interface LiveEvent {
  id: string;
  phase: 'start' | 'end';
  nodeId: string | null;
  provider: string;
  model: string;
  endpoint: string;
  clientIp?: string | null;
  status?: number;
  latencyMs?: number;
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** When the request started (or, if the start was missed, when it ended). */
  startedAt: string;
  endedAt?: string;
}

interface RealtimeState {
  runtime: Record<string, NodeRuntime>;
  events: LiveEvent[];
  connected: boolean;
  setConnected: (connected: boolean) => void;
  apply: (event: RealtimeEvent) => void;
}

const MAX_EVENTS = 100;

export const useRealtimeStore = create<RealtimeState>((set) => ({
  runtime: {},
  events: [],
  connected: false,
  setConnected: (connected) => set({ connected }),
  apply: (event) =>
    set((state) => {
      switch (event.type) {
        case 'snapshot':
        case 'node:metrics': {
          const runtime = { ...state.runtime };
          for (const n of event.nodes) runtime[n.id] = n;
          return { runtime };
        }
        case 'node:status': {
          const current = state.runtime[event.id];
          if (!current) return {};
          return {
            runtime: { ...state.runtime, [event.id]: { ...current, status: event.status } },
          };
        }
        case 'request:start': {
          const entry: LiveEvent = {
            id: event.id,
            phase: 'start',
            nodeId: event.nodeId,
            provider: event.provider,
            model: event.model,
            endpoint: event.endpoint,
            clientIp: event.clientIp ?? null,
            startedAt: event.at,
          };
          // Update in place if we somehow already have this id; else prepend.
          const exists = state.events.some((e) => e.id === event.id);
          const events = exists
            ? state.events.map((e) => (e.id === event.id ? { ...e, ...entry } : e))
            : [entry, ...state.events].slice(0, MAX_EVENTS);
          return { events };
        }
        case 'request:end': {
          let found = false;
          const events = state.events.map((e) => {
            if (e.id !== event.id) return e;
            found = true;
            return {
              ...e,
              phase: 'end' as const,
              nodeId: event.nodeId,
              provider: event.provider,
              model: event.model,
              endpoint: event.endpoint,
              clientIp: e.clientIp ?? event.clientIp ?? null,
              status: event.status,
              latencyMs: event.latencyMs,
              promptTokens: event.promptTokens,
              completionTokens: event.completionTokens,
              endedAt: event.at,
            };
          });
          if (found) return { events };
          // End without a matching start (e.g. tab opened mid-flight): synthesize.
          const entry: LiveEvent = {
            id: event.id,
            phase: 'end',
            nodeId: event.nodeId,
            provider: event.provider,
            model: event.model,
            endpoint: event.endpoint,
            clientIp: event.clientIp ?? null,
            status: event.status,
            latencyMs: event.latencyMs,
            promptTokens: event.promptTokens,
            completionTokens: event.completionTokens,
            startedAt: event.at,
            endedAt: event.at,
          };
          return { events: [entry, ...state.events].slice(0, MAX_EVENTS) };
        }
        default:
          return {};
      }
    }),
}));
