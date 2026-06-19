import type { FastifyInstance } from 'fastify';
import { analyticsQuerySchema } from '@ai-orchestrator/shared';
import { getAnalytics, getRecentEvents } from '../../analytics/queries';
import { parseWith } from './util';

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  const read = { preHandler: app.requirePermission('analytics:read') };

  app.get('/analytics', read, async (req, reply) => {
    const query = parseWith(analyticsQuerySchema, req.query);
    return reply.send(await getAnalytics(query));
  });

  // Recent request rows for the Debug view (newest first; `errors=1` = failures only).
  // Optional filters: provider, ip, endpoint, model, nodeId, status.
  app.get('/debug/events', read, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const str = (v: string | undefined): string | undefined =>
      typeof v === 'string' && v ? v : undefined;
    const status = Number(q.status);
    return reply.send(
      await getRecentEvents({
        limit,
        onlyErrors: q.errors === '1' || q.errors === 'true',
        provider: str(q.provider),
        ip: str(q.ip),
        endpoint: str(q.endpoint),
        model: str(q.model),
        nodeId: str(q.nodeId),
        status: Number.isFinite(status) && status > 0 ? status : undefined,
      }),
    );
  });
}
