import type { FastifyInstance } from 'fastify';
import { createSkillSchema, updateSkillSchema } from '@ai-orchestrator/shared';
import { parseWith, pathId } from './util';

/** Skills registry (reusable system-prompt + model + MCP tool presets). */
export function registerSkillRoutes(app: FastifyInstance): void {
  const read = { preHandler: app.requirePermission('providers:read') };
  const write = { preHandler: app.requirePermission('providers:write') };

  app.get('/skills', read, async (_req, reply) => {
    return reply.send(await app.mcp.listSkills());
  });

  app.post('/skills', write, async (req, reply) => {
    const input = parseWith(createSkillSchema, req.body);
    return reply.code(201).send(await app.mcp.createSkill(input));
  });

  app.patch('/skills/:id', write, async (req, reply) => {
    const patch = parseWith(updateSkillSchema, req.body);
    return reply.send(await app.mcp.updateSkill(pathId(req.params), patch));
  });

  app.delete('/skills/:id', write, async (req, reply) => {
    await app.mcp.deleteSkill(pathId(req.params));
    return reply.code(204).send();
  });
}
