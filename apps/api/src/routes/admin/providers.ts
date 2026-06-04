import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  createModelRouteSchema,
  createProviderSchema,
  updateProviderSchema,
  type Provider,
} from '@ai-orchestrator/shared';
import { db } from '../../db/client';
import { modelRoutes, providers, type ProviderRow } from '../../db/schema';
import { encryptSecret } from '../../lib/crypto';
import { notFound } from '../../lib/errors';
import { parseWith, pathId } from './util';

function toPublic(row: ProviderRow): Provider {
  return {
    id: row.id,
    type: row.type as Provider['type'],
    name: row.name,
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    region: row.region,
    defaultModel: row.defaultModel,
    hasCredentials: row.credentialsEncrypted != null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

interface CredsInput {
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/** Encrypt provided credentials as a single JSON blob, or null when none given. */
function buildCreds(input: CredsInput): string | null {
  const creds: Record<string, string> = {};
  if (input.apiKey) creds.apiKey = input.apiKey;
  if (input.accessKeyId) creds.accessKeyId = input.accessKeyId;
  if (input.secretAccessKey) creds.secretAccessKey = input.secretAccessKey;
  return Object.keys(creds).length > 0 ? encryptSecret(JSON.stringify(creds)) : null;
}

export function registerProviderRoutes(app: FastifyInstance): void {
  const admin = { preHandler: app.requireAdmin };

  app.get('/providers', admin, async (_req, reply) => {
    const rows = await db.select().from(providers);
    return reply.send(rows.map(toPublic));
  });

  app.post('/providers', admin, async (req, reply) => {
    const input = parseWith(createProviderSchema, req.body);
    const [row] = await db
      .insert(providers)
      .values({
        type: input.type,
        name: input.name,
        enabled: input.enabled,
        baseUrl: input.baseUrl ?? null,
        region: input.region ?? null,
        defaultModel: input.defaultModel ?? null,
        credentialsEncrypted: buildCreds(input),
      })
      .returning();
    await app.providers.load();
    return reply.code(201).send(toPublic(row));
  });

  app.patch('/providers/:id', admin, async (req, reply) => {
    const id = pathId(req.params);
    const input = parseWith(updateProviderSchema, req.body);
    const update: Partial<typeof providers.$inferInsert> = { updatedAt: new Date() };
    if (input.type !== undefined) update.type = input.type;
    if (input.name !== undefined) update.name = input.name;
    if (input.enabled !== undefined) update.enabled = input.enabled;
    if (input.baseUrl !== undefined) update.baseUrl = input.baseUrl;
    if (input.region !== undefined) update.region = input.region;
    if (input.defaultModel !== undefined) update.defaultModel = input.defaultModel;
    const newCreds = buildCreds(input);
    if (newCreds) update.credentialsEncrypted = newCreds;

    const [row] = await db.update(providers).set(update).where(eq(providers.id, id)).returning();
    if (!row) throw notFound('Provider not found.');
    await app.providers.load();
    return reply.send(toPublic(row));
  });

  app.delete('/providers/:id', admin, async (req, reply) => {
    const id = pathId(req.params);
    const rows = await db
      .delete(providers)
      .where(eq(providers.id, id))
      .returning({ id: providers.id });
    if (rows.length === 0) throw notFound('Provider not found.');
    await app.providers.load();
    return reply.code(204).send();
  });

  // --- model registry ------------------------------------------------------
  app.get('/model-routes', admin, async (_req, reply) => {
    return reply.send(await db.select().from(modelRoutes));
  });

  app.post('/model-routes', admin, async (req, reply) => {
    const input = parseWith(createModelRouteSchema, req.body);
    const [row] = await db
      .insert(modelRoutes)
      .values({
        alias: input.alias,
        providerId: input.providerId ?? null,
        providerType: input.providerType,
        targetModel: input.targetModel,
        enabled: input.enabled,
      })
      .returning();
    await app.providers.load();
    return reply.code(201).send(row);
  });

  app.delete('/model-routes/:id', admin, async (req, reply) => {
    const id = pathId(req.params);
    const rows = await db
      .delete(modelRoutes)
      .where(eq(modelRoutes.id, id))
      .returning({ id: modelRoutes.id });
    if (rows.length === 0) throw notFound('Model route not found.');
    await app.providers.load();
    return reply.code(204).send();
  });
}
