import type { FastifyInstance } from 'fastify';
import {
  createMcpServerSchema,
  setToolAllowSchema,
  updateMcpServerSchema,
} from '@ai-orchestrator/shared';
import { badRequest } from '../../lib/errors';
import { parseWith, pathId } from './util';

/** MCP server registry + tool discovery/allowlist. Gated on `providers:*`. */
export function registerMcpRoutes(app: FastifyInstance): void {
  const read = { preHandler: app.requirePermission('providers:read') };
  const write = { preHandler: app.requirePermission('providers:write') };

  app.get('/mcp/servers', read, async (_req, reply) => {
    return reply.send(await app.mcp.listServers());
  });

  app.post('/mcp/servers', write, async (req, reply) => {
    const input = parseWith(createMcpServerSchema, req.body);
    return reply.code(201).send(await app.mcp.createServer(input));
  });

  app.patch('/mcp/servers/:id', write, async (req, reply) => {
    const patch = parseWith(updateMcpServerSchema, req.body);
    return reply.send(await app.mcp.updateServer(pathId(req.params), patch));
  });

  app.delete('/mcp/servers/:id', write, async (req, reply) => {
    await app.mcp.deleteServer(pathId(req.params));
    return reply.code(204).send();
  });

  /** Connect and refresh the server's tool list. */
  app.post('/mcp/servers/:id/discover', write, async (req, reply) => {
    return reply.send(await app.mcp.discover(pathId(req.params)));
  });

  /** Update which discovered tools are eligible for triage. */
  app.put('/mcp/servers/:id/tools', write, async (req, reply) => {
    const input = parseWith(setToolAllowSchema, req.body);
    return reply.send(await app.mcp.setToolAllow(pathId(req.params), input));
  });

  /** Invoke a tool directly (admin test). */
  app.post('/mcp/servers/:id/call', write, async (req, reply) => {
    const body = req.body as { tool?: unknown; args?: unknown } | undefined;
    const tool = typeof body?.tool === 'string' ? body.tool : '';
    if (!tool) throw badRequest('Missing tool name.');
    const args =
      body?.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {};
    return reply.send(await app.mcp.callServerTool(pathId(req.params), tool, args));
  });
}
