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
  app.get('/debug/events', read, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);
    const onlyErrors = q.errors === '1' || q.errors === 'true';
    const provider = typeof q.provider === 'string' && q.provider ? q.provider : undefined;
    return reply.send(await getRecentEvents({ limit, onlyErrors, provider }));
  });
}
