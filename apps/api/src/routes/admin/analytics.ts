import type { FastifyInstance } from 'fastify';
import { analyticsQuerySchema } from '@ai-orchestrator/shared';
import { getAnalytics } from '../../analytics/queries';
import { parseWith } from './util';

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  app.get('/analytics', { preHandler: app.requireAdmin }, async (req, reply) => {
    const query = parseWith(analyticsQuerySchema, req.query);
    return reply.send(await getAnalytics(query));
  });
}
