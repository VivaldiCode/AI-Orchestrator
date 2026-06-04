import { useEffect } from 'react';
import type { RealtimeEvent } from '@ai-orchestrator/shared';
import { getTokens } from './api';
import { useRealtimeStore } from './store';

/** Opens (and auto-reconnects) the realtime WebSocket and feeds the store. */
export function useRealtimeConnection(): void {
  const apply = useRealtimeStore((s) => s.apply);
  const setConnected = useRealtimeStore((s) => s.setConnected);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = (): void => {
      const tokens = getTokens();
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const tokenParam = tokens ? `?token=${encodeURIComponent(tokens.accessToken)}` : '';
      socket = new WebSocket(`${proto}://${window.location.host}/ws${tokenParam}`);

      socket.onopen = () => setConnected(true);
      socket.onmessage = (ev) => {
        try {
          apply(JSON.parse(ev.data as string) as RealtimeEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, [apply, setConnected]);
}
