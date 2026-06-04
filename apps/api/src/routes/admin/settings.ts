import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { settingsSchema, updateSettingsSchema, type Settings } from '@ai-orchestrator/shared';
import { db } from '../../db/client';
import { settings as settingsTable } from '../../db/schema';
import { parseWith } from './util';

export function registerSettingsRoutes(app: FastifyInstance): void {
  const admin = { preHandler: app.requireAdmin };

  app.get('/settings', admin, async (_req, reply) => {
    return reply.send(app.orchestrator.getSettings());
  });

  app.put('/settings', admin, async (req, reply) => {
    const patch = parseWith(updateSettingsSchema, req.body);
    const next: Settings = settingsSchema.parse({ ...app.orchestrator.getSettings(), ...patch });
    await db
      .update(settingsTable)
      .set({
        strategy: next.strategy,
        modelAware: next.modelAware,
        autoPull: next.autoPull,
        failoverRetries: next.failoverRetries,
        updatedAt: new Date(),
      })
      .where(eq(settingsTable.id, 1));
    app.orchestrator.setSettings(next);
    return reply.send(next);
  });
}
