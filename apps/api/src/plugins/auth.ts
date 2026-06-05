import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ROLE_PERMISSIONS, type Permission, type Role } from '@ai-orchestrator/shared';
import { config } from '../config/index';
import { forbidden, unauthorized } from '../lib/errors';

/**
 * Registers JWT support and two preHandlers:
 * - `requireAdmin`  — valid dashboard access token with the admin role.
 * - `requireApiKey` — valid inference API key. Open until the first key is
 *   created (drop-in friendly), enforced thereafter.
 */
export async function registerAuth(app: FastifyInstance): Promise<void> {
  await app.register(fastifyJwt, { secret: config.jwtSecret });

  app.decorate('requireAdmin', async function (request: FastifyRequest, _reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Authentication required.');
    }
    const payload = request.user;
    if (payload.type !== 'access') throw unauthorized('Invalid token type.');
    if (payload.role !== 'admin') throw forbidden('Admin privileges required.');
    request.adminUser = { sub: payload.sub, username: payload.username, role: payload.role };
  });

  // Any authenticated dashboard user (any role) with a valid access token.
  app.decorate('requireUser', async function (request: FastifyRequest, _reply: FastifyReply) {
    try {
      await request.jwtVerify();
    } catch {
      throw unauthorized('Authentication required.');
    }
    const payload = request.user;
    if (payload.type !== 'access') throw unauthorized('Invalid token type.');
    request.adminUser = { sub: payload.sub, username: payload.username, role: payload.role };
  });

  // Gate a route on a specific feature permission (RBAC). `admin` always passes;
  // other roles must carry the permission in their token (or via role defaults).
  app.decorate('requirePermission', function (permission: Permission) {
    return async function (request: FastifyRequest, _reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        throw unauthorized('Authentication required.');
      }
      const payload = request.user;
      if (payload.type !== 'access') throw unauthorized('Invalid token type.');
      const perms = payload.perms ?? ROLE_PERMISSIONS[payload.role as Role] ?? [];
      if (payload.role !== 'admin' && !perms.includes(permission)) {
        throw forbidden(`Missing permission: ${permission}.`);
      }
      request.adminUser = { sub: payload.sub, username: payload.username, role: payload.role };
    };
  });

  app.decorate('requireApiKey', async function (request: FastifyRequest, _reply: FastifyReply) {
    request.clientKeyId = null;
    const count = await app.auth.apiKeyCount();
    if (count === 0) return; // open mode until the operator creates the first key

    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) {
      throw unauthorized('API key required: Authorization: Bearer <key>.');
    }
    const row = await app.auth.verifyApiKey(token);
    if (!row) throw unauthorized('Invalid API key.');
    request.clientKeyId = row.id;
  });
}
