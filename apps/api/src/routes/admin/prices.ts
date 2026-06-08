import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  createModelPriceSchema,
  updateModelPriceSchema,
  type ModelPrice,
} from '@ai-orchestrator/shared';
import { db } from '../../db/client';
import { modelPrices, type ModelPriceRow } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { parseWith, pathId } from './util';

function toPublic(row: ModelPriceRow): ModelPrice {
  return {
    id: row.id,
    provider: row.provider,
    model: row.model,
    inputPerMtok: row.inputPerMtok,
    outputPerMtok: row.outputPerMtok,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Per-model token pricing (USD per 1M tokens). Reuses the providers permission. */
export function registerPriceRoutes(app: FastifyInstance): void {
  const read = { preHandler: app.requirePermission('providers:read') };
  const write = { preHandler: app.requirePermission('providers:write') };

  app.get('/prices', read, async (_req, reply) => {
    const rows = await db.select().from(modelPrices);
    return reply.send(rows.map(toPublic));
  });

  // Upsert by (provider, model) so re-adding an existing pair just updates it.
  app.post('/prices', write, async (req, reply) => {
    const input = parseWith(createModelPriceSchema, req.body);
    const [row] = await db
      .insert(modelPrices)
      .values({
        provider: input.provider,
        model: input.model,
        inputPerMtok: input.inputPerMtok,
        outputPerMtok: input.outputPerMtok,
      })
      .onConflictDoUpdate({
        target: [modelPrices.provider, modelPrices.model],
        set: {
          inputPerMtok: input.inputPerMtok,
          outputPerMtok: input.outputPerMtok,
          updatedAt: new Date(),
        },
      })
      .returning();
    await app.prices.load();
    return reply.code(201).send(toPublic(row));
  });

  app.patch('/prices/:id', write, async (req, reply) => {
    const id = pathId(req.params);
    const input = parseWith(updateModelPriceSchema, req.body);
    const update: Partial<typeof modelPrices.$inferInsert> = { updatedAt: new Date() };
    if (input.provider !== undefined) update.provider = input.provider;
    if (input.model !== undefined) update.model = input.model;
    if (input.inputPerMtok !== undefined) update.inputPerMtok = input.inputPerMtok;
    if (input.outputPerMtok !== undefined) update.outputPerMtok = input.outputPerMtok;
    const [row] = await db
      .update(modelPrices)
      .set(update)
      .where(eq(modelPrices.id, id))
      .returning();
    if (!row) throw notFound('Price not found.');
    await app.prices.load();
    return reply.send(toPublic(row));
  });

  app.delete('/prices/:id', write, async (req, reply) => {
    const id = pathId(req.params);
    const rows = await db
      .delete(modelPrices)
      .where(eq(modelPrices.id, id))
      .returning({ id: modelPrices.id });
    if (rows.length === 0) throw notFound('Price not found.');
    await app.prices.load();
    return reply.code(204).send();
  });
}
