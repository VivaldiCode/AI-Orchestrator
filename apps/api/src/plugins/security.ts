import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index';

/** Registers Helmet security headers, strict CORS, and rate limiting. */
export async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(helmet, {
    // The API serves JSON and streams, never HTML, so a locked-down CSP is safe.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  await app.register(cors, {
    origin: config.dashboardOrigins.length ? config.dashboardOrigins : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindow,
    // Identify clients by API key when present, else by IP.
    keyGenerator: (request) => {
      const auth = request.headers.authorization;
      if (auth?.startsWith('Bearer ')) return auth.slice(7, 27);
      return request.ip;
    },
  });
}
