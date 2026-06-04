import { create } from 'zustand';
import type { NodeRuntime, RealtimeEvent } from '@ai-orchestrator/shared';

export interface LiveEvent {
  id: string;
  phase: 'start' | 'end';
  nodeId: string | null;
  provider: string;
  model: string;
  endpoint: string;
  status?: number;
  latencyMs?: number;
  at: string;
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
          const e: LiveEvent = {
            id: event.id,
            phase: 'start',
            nodeId: event.nodeId,
            provider: event.provider,
            model: event.model,
            endpoint: event.endpoint,
            at: event.at,
          };
          return { events: [e, ...state.events].slice(0, MAX_EVENTS) };
        }
        case 'request:end': {
          const e: LiveEvent = {
            id: event.id,
            phase: 'end',
            nodeId: event.nodeId,
            provider: event.provider,
            model: event.model,
            endpoint: event.endpoint,
            status: event.status,
            latencyMs: event.latencyMs,
            at: event.at,
          };
          return { events: [e, ...state.events].slice(0, MAX_EVENTS) };
        }
        default:
          return {};
      }
    }),
}));
