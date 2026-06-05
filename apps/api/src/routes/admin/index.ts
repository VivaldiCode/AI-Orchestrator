import type { FastifyInstance } from 'fastify';
import { registerAnalyticsRoutes } from './analytics';
import { registerAuthRoutes } from './auth';
import { registerNodeRoutes } from './nodes';
import { registerProviderRoutes } from './providers';
import { registerSettingsRoutes } from './settings';
import { registerUserRoutes } from './users';

/** All management endpoints, served under the `/admin` prefix (JSON bodies). */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (scope) => {
      registerAuthRoutes(scope);
      registerUserRoutes(scope);
      registerNodeRoutes(scope);
      registerProviderRoutes(scope);
      registerSettingsRoutes(scope);
      registerAnalyticsRoutes(scope);
    },
    { prefix: '/admin' },
  );
}
