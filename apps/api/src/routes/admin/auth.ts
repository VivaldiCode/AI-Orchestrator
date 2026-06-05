import type { FastifyInstance } from 'fastify';
import {
  createApiKeySchema,
  loginSchema,
  refreshSchema,
  setupSchema,
  type TokenPair,
} from '@ai-orchestrator/shared';
import { config } from '../../config/index';
import { unauthorized } from '../../lib/errors';
import { parseWith, pathId } from './util';

interface TokenUser {
  id: string;
  username: string;
  role: string;
  permissions?: string[];
}

export function issueTokens(app: FastifyInstance, user: TokenUser): TokenPair {
  const base = {
    sub: user.id,
    username: user.username,
    role: user.role,
    perms: user.permissions ?? [],
  };
  const accessToken = app.jwt.sign(
    { ...base, type: 'access' },
    { expiresIn: config.jwtAccessTtl * 1000 },
  );
  const refreshToken = app.jwt.sign(
    { ...base, type: 'refresh' },
    { expiresIn: config.jwtRefreshTtl * 1000 },
  );
  return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: config.jwtAccessTtl };
}

export function registerAuthRoutes(app: FastifyInstance): void {
  // Stricter per-route limit on credential endpoints (brute-force defence, on
  // top of the global limiter).
  const strict = { config: { rateLimit: { max: 10, timeWindow: 60_000 } } };

  app.get('/auth/setup-status', async (_req, reply) => {
    return reply.send({ needsSetup: await app.auth.needsSetup() });
  });

  app.post('/auth/setup', strict, async (req, reply) => {
    const { username, password } = parseWith(setupSchema, req.body);
    const user = await app.auth.createAdmin(username, password);
    return reply.code(201).send({ user, tokens: issueTokens(app, user) });
  });

  app.post('/auth/login', strict, async (req, reply) => {
    const { username, password } = parseWith(loginSchema, req.body);
    const row = await app.auth.login(username, password);
    return reply.send(issueTokens(app, app.auth.toUser(row)));
  });

  app.post('/auth/refresh', strict, async (req, reply) => {
    const { refreshToken } = parseWith(refreshSchema, req.body);
    let payload;
    try {
      payload = app.jwt.verify<{
        sub: string;
        username: string;
        role: string;
        perms?: string[];
        type: 'access' | 'refresh';
      }>(refreshToken);
    } catch {
      throw unauthorized('Invalid refresh token.');
    }
    if (payload.type !== 'refresh') throw unauthorized('Invalid token type.');
    return reply.send(
      issueTokens(app, {
        id: payload.sub,
        username: payload.username,
        role: payload.role,
        permissions: payload.perms,
      }),
    );
  });

  app.get('/auth/me', { preHandler: app.requireUser }, async (req, reply) => {
    const u = req.user;
    return reply.send({
      id: u.sub,
      username: u.username,
      role: u.role,
      permissions: u.perms ?? [],
    });
  });

  // --- API keys ------------------------------------------------------------
  app.get(
    '/api-keys',
    { preHandler: app.requirePermission('apikeys:read') },
    async (_req, reply) => {
      return reply.send(await app.auth.listApiKeys());
    },
  );

  app.post(
    '/api-keys',
    { preHandler: app.requirePermission('apikeys:write') },
    async (req, reply) => {
      const { name, scopes } = parseWith(createApiKeySchema, req.body);
      return reply.code(201).send(await app.auth.createApiKey(name, scopes));
    },
  );

  app.delete(
    '/api-keys/:id',
    { preHandler: app.requirePermission('apikeys:write') },
    async (req, reply) => {
      await app.auth.revokeApiKey(pathId(req.params));
      return reply.code(204).send();
    },
  );
}
