import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createNodeSchema, updateNodeSchema, type NodeWithRuntime } from '@ai-orchestrator/shared';
import { db } from '../../db/client';
import { nodes } from '../../db/schema';
import { notFound } from '../../lib/errors';
import { nodeBaseUrl, toNodeRuntime, type ManagedNode } from '../../orchestrator/types';
import { parseWith, pathId } from './util';

function toDto(n: ManagedNode): NodeWithRuntime {
  return {
    id: n.id,
    name: n.name,
    host: n.host,
    port: n.port,
    protocol: n.protocol,
    weight: n.weight,
    enabled: n.enabled,
    maxConcurrency: n.maxConcurrency,
    tags: n.tags,
    agentPort: n.agentPort,
    enabledModels: n.enabledModels,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    runtime: toNodeRuntime(n),
  };
}

export function registerNodeRoutes(app: FastifyInstance): void {
  const reg = app.orchestrator.registry;
  const admin = { preHandler: app.requireAdmin };

  app.get('/nodes', admin, async (_req, reply) => {
    return reply.send(reg.list().map(toDto));
  });

  app.post('/nodes', admin, async (req, reply) => {
    const input = parseWith(createNodeSchema, req.body);
    const [row] = await db.insert(nodes).values(input).returning();
    const managed = reg.upsert(row);
    return reply.code(201).send(toDto(managed));
  });

  app.get('/nodes/:id', admin, async (req, reply) => {
    const node = reg.get(pathId(req.params));
    if (!node) throw notFound('Node not found.');
    return reply.send(toDto(node));
  });

  app.patch('/nodes/:id', admin, async (req, reply) => {
    const id = pathId(req.params);
    const patch = parseWith(updateNodeSchema, req.body);
    const [row] = await db
      .update(nodes)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(nodes.id, id))
      .returning();
    if (!row) throw notFound('Node not found.');
    const managed = reg.upsert(row);
    return reply.send(toDto(managed));
  });

  app.delete('/nodes/:id', admin, async (req, reply) => {
    const id = pathId(req.params);
    const rows = await db.delete(nodes).where(eq(nodes.id, id)).returning({ id: nodes.id });
    if (rows.length === 0) throw notFound('Node not found.');
    reg.remove(id);
    return reply.code(204).send();
  });

  /** Live connectivity test against a node's Ollama API. */
  app.post('/nodes/:id/test', admin, async (req, reply) => {
    const node = reg.get(pathId(req.params));
    if (!node) throw notFound('Node not found.');
    const base = nodeBaseUrl(node);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const start = performance.now();
    try {
      const [version, tags] = await Promise.all([
        fetch(`${base}/api/version`, { signal: ctrl.signal }).then(
          (r) => r.json() as Promise<{ version?: string }>,
        ),
        fetch(`${base}/api/tags`, { signal: ctrl.signal }).then(
          (r) => r.json() as Promise<{ models?: { name: string }[] }>,
        ),
      ]);
      return reply.send({
        ok: true,
        latencyMs: Math.round(performance.now() - start),
        version: version.version ?? null,
        models: (tags.models ?? []).map((m) => m.name),
      });
    } catch (err) {
      return reply.send({ ok: false, error: (err as Error).message });
    } finally {
      clearTimeout(timer);
    }
  });
}
