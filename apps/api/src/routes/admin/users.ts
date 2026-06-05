import type { FastifyInstance } from 'fastify';
import { createUserSchema, updateUserSchema } from '@ai-orchestrator/shared';
import { badRequest } from '../../lib/errors';
import { parseWith, pathId } from './util';

/**
 * User-account management (RBAC). Gated on the `users:*` permissions; the admin
 * role always passes. The last admin can neither be demoted nor deleted, and an
 * operator cannot delete their own account.
 */
export function registerUserRoutes(app: FastifyInstance): void {
  app.get('/users', { preHandler: app.requirePermission('users:read') }, async (_req, reply) => {
    return reply.send(await app.auth.listUsers());
  });

  app.post('/users', { preHandler: app.requirePermission('users:write') }, async (req, reply) => {
    const input = parseWith(createUserSchema, req.body);
    return reply.code(201).send(await app.auth.createUser(input));
  });

  app.patch(
    '/users/:id',
    { preHandler: app.requirePermission('users:write') },
    async (req, reply) => {
      const patch = parseWith(updateUserSchema, req.body);
      return reply.send(await app.auth.updateUser(pathId(req.params), patch));
    },
  );

  app.delete(
    '/users/:id',
    { preHandler: app.requirePermission('users:write') },
    async (req, reply) => {
      const id = pathId(req.params);
      if (req.adminUser?.sub === id) throw badRequest('You cannot delete your own account.');
      await app.auth.deleteUser(id);
      return reply.code(204).send();
    },
  );
}
