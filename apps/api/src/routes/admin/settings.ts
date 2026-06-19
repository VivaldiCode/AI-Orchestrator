import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { settingsSchema, updateSettingsSchema, type Settings } from '@ai-orchestrator/shared';
import { db } from '../../db/client';
import { settings as settingsTable } from '../../db/schema';
import { parseWith } from './util';

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get(
    '/settings',
    { preHandler: app.requirePermission('settings:read') },
    async (_req, reply) => {
      return reply.send(app.orchestrator.getSettings());
    },
  );

  app.put(
    '/settings',
    { preHandler: app.requirePermission('settings:write') },
    async (req, reply) => {
      const patch = parseWith(updateSettingsSchema, req.body);
      const next: Settings = settingsSchema.parse({ ...app.orchestrator.getSettings(), ...patch });
      await db
        .update(settingsTable)
        .set({
          strategy: next.strategy,
          modelAware: next.modelAware,
          contextAware: next.contextAware,
          autoPull: next.autoPull,
          failoverRetries: next.failoverRetries,
          triageEnabled: next.triageEnabled,
          triageModel: next.triageModel,
          maxToolCalls: next.maxToolCalls,
          requestLogMax: next.requestLogMax,
          cloudOverflow: next.cloudOverflow,
          cloudOverflowProviderId: next.cloudOverflowProviderId,
          cloudOverflowModel: next.cloudOverflowModel,
          embedOverflow: next.embedOverflow,
          embedOverflowProviderId: next.embedOverflowProviderId,
          embedOverflowModel: next.embedOverflowModel,
          privacyMode: next.privacyMode,
          updatedAt: new Date(),
        })
        .where(eq(settingsTable.id, 1));
      app.orchestrator.setSettings(next);
      return reply.send(next);
    },
  );
}
