import type { FastifyInstance } from 'fastify';
import { notFound } from '../../lib/errors';

/**
 * Browse the on-disk request archive (admin only — it contains every prompt).
 * Works with a dashboard JWT or an admin-scoped API key.
 */
export function registerArchiveRoutes(app: FastifyInstance): void {
  const admin = { preHandler: app.requireAdmin };

  // Available archive days (YYYY-MM-DD), newest first.
  app.get('/archive/dates', admin, async (_req, reply) => {
    return reply.send(await app.archive.listDates());
  });

  // A page of entries for a day (defaults to the most recent), newest first.
  app.get('/archive', admin, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 500);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const date = typeof q.date === 'string' && q.date ? q.date : undefined;
    return reply.send(await app.archive.list({ date, limit, offset }));
  });

  // Metadata for a single archived exchange.
  app.get('/archive/:date/:id', admin, async (req, reply) => {
    const { date, id } = req.params as { date: string; id: string };
    const meta = await app.archive.readMeta(date, id);
    if (!meta) throw notFound('Archive entry not found.');
    return reply.send(meta);
  });

  // Raw request (prompt) and response bodies, exactly as stored.
  for (const kind of ['request', 'response'] as const) {
    app.get(`/archive/:date/:id/${kind}`, admin, async (req, reply) => {
      const { date, id } = req.params as { date: string; id: string };
      const buf = await app.archive.readBody(date, id, kind);
      if (!buf) throw notFound('Archive body not found.');
      return reply.header('content-type', 'text/plain; charset=utf-8').send(buf);
    });
  }
}
