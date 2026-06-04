import type { FastifyInstance } from 'fastify';
import { registerAnalyticsRoutes } from './analytics';
import { registerAuthRoutes } from './auth';
import { registerNodeRoutes } from './nodes';
import { registerProviderRoutes } from './providers';
import { registerSettingsRoutes } from './settings';

/** All management endpoints, served under the `/admin` prefix (JSON bodies). */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (scope) => {
      registerAuthRoutes(scope);
      registerNodeRoutes(scope);
      registerProviderRoutes(scope);
      registerSettingsRoutes(scope);
      registerAnalyticsRoutes(scope);
    },
    { prefix: '/admin' },
  );
}
