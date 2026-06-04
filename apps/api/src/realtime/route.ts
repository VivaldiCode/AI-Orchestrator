import websocket from '@fastify/websocket';
import type { FastifyInstance } from 'fastify';
import type { RealtimeClient } from './hub';

/**
 * Dashboard realtime WebSocket at `/ws`. Clients receive a snapshot on connect,
 * then live node + request events. If a `?token=` is provided it must be a valid
 * JWT (the dashboard supplies its access token).
 */
export async function registerRealtime(app: FastifyInstance): Promise<void> {
  await app.register(websocket, { options: { maxPayload: 1 << 20 } });

  app.get('/ws', { websocket: true }, (socket, req) => {
    const token = (req.query as { token?: string } | undefined)?.token;
    if (token) {
      try {
        app.jwt.verify(token);
      } catch {
        socket.close(1008, 'invalid token');
        return;
      }
    }

    const client: RealtimeClient = {
      send: (data) => socket.send(data),
      get closed() {
        return socket.readyState !== 1; // 1 === OPEN
      },
    };

    app.orchestrator.hub.add(client);
    socket.on('close', () => app.orchestrator.hub.remove(client));
    socket.on('error', () => app.orchestrator.hub.remove(client));
  });
}
