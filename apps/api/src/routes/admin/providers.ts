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
import { badRequest, notFound } from '../../lib/errors';
import { parseWith, pathId } from './util';

function toPublic(
  row: ProviderRow,
  spentThisMonthUsd: number,
  subscription: Provider['subscription'],
): Provider {
  return {
    id: row.id,
    type: row.type as Provider['type'],
    name: row.name,
    enabled: row.enabled,
    baseUrl: row.baseUrl,
    region: row.region,
    defaultModel: row.defaultModel,
    hasCredentials: row.credentialsEncrypted != null,
    budgetMonthlyUsd: row.budgetMonthlyUsd ?? 0,
    spentThisMonthUsd,
    authMode: (row.authMode as Provider['authMode']) ?? 'api-key',
    subscription,
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
  const read = { preHandler: app.requirePermission('providers:read') };
  const write = { preHandler: app.requirePermission('providers:write') };

  const pub = (row: ProviderRow): Provider =>
    toPublic(row, app.providers.spentForType(row.type), app.providers.subscriptionStatus(row.id));

  app.get('/providers', read, async (_req, reply) => {
    const rows = await db.select().from(providers);
    return reply.send(rows.map(pub));
  });

  app.post('/providers', write, async (req, reply) => {
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
        budgetMonthlyUsd: input.budgetMonthlyUsd ?? 0,
        authMode: input.authMode ?? 'api-key',
        credentialsEncrypted: buildCreds(input),
      })
      .returning();
    await app.providers.load();
    return reply.code(201).send(pub(row));
  });

  app.patch('/providers/:id', write, async (req, reply) => {
    const id = pathId(req.params);
    const input = parseWith(updateProviderSchema, req.body);
    const update: Partial<typeof providers.$inferInsert> = { updatedAt: new Date() };
    if (input.type !== undefined) update.type = input.type;
    if (input.name !== undefined) update.name = input.name;
    if (input.enabled !== undefined) update.enabled = input.enabled;
    if (input.baseUrl !== undefined) update.baseUrl = input.baseUrl;
    if (input.region !== undefined) update.region = input.region;
    if (input.defaultModel !== undefined) update.defaultModel = input.defaultModel;
    if (input.budgetMonthlyUsd !== undefined) update.budgetMonthlyUsd = input.budgetMonthlyUsd;
    if (input.authMode !== undefined) update.authMode = input.authMode;
    const newCreds = buildCreds(input);
    if (newCreds) update.credentialsEncrypted = newCreds;

    const [row] = await db.update(providers).set(update).where(eq(providers.id, id)).returning();
    if (!row) throw notFound('Provider not found.');
    await app.providers.load();
    return reply.send(pub(row));
  });

  app.delete('/providers/:id', write, async (req, reply) => {
    const id = pathId(req.params);
    const rows = await db
      .delete(providers)
      .where(eq(providers.id, id))
      .returning({ id: providers.id });
    if (rows.length === 0) throw notFound('Provider not found.');
    await app.providers.load();
    return reply.code(204).send();
  });

  // --- xAI subscription (OAuth device flow) --------------------------------
  // Connect a SuperGrok / X Premium subscription without an API key: start the
  // device flow, show the user the code+URL, poll until approved. Tokens are
  // stored encrypted and auto-refreshed; inference then uses the access token.
  const requireXai = (id: string): void => {
    const cfg = app.providers.getConfig(id);
    if (!cfg) throw notFound('Provider not found.');
    if (cfg.type !== 'xai') {
      throw badRequest('Subscription login is only available for xAI providers.');
    }
  };

  app.post('/providers/:id/xai/device/start', write, async (req, reply) => {
    const id = pathId(req.params);
    requireXai(id);
    return reply.send(await app.xaiSubscription.start(id));
  });

  app.post('/providers/:id/xai/device/poll', write, async (req, reply) => {
    const id = pathId(req.params);
    requireXai(id);
    const res = await app.xaiSubscription.poll(id);
    if (res.status === 'connected') await app.providers.load();
    return reply.send(res);
  });

  app.post('/providers/:id/xai/disconnect', write, async (req, reply) => {
    const id = pathId(req.params);
    requireXai(id);
    await app.xaiSubscription.disconnect(id);
    await app.providers.load();
    return reply.send({ status: 'disconnected' });
  });

  // --- model registry ------------------------------------------------------
  app.get('/model-routes', read, async (_req, reply) => {
    return reply.send(await db.select().from(modelRoutes));
  });

  app.post('/model-routes', write, async (req, reply) => {
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

  app.delete('/model-routes/:id', write, async (req, reply) => {
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
