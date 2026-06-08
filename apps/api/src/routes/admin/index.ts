import type { FastifyInstance } from 'fastify';
import { registerAnalyticsRoutes } from './analytics';
import { registerAuthRoutes } from './auth';
import { registerOAuthRoutes } from './oauth';
import { registerNodeRoutes } from './nodes';
import { registerProviderRoutes } from './providers';
import { registerSettingsRoutes } from './settings';
import { registerUserRoutes } from './users';
import { registerMcpRoutes } from './mcp';
import { registerSkillRoutes } from './skills';
import { registerArchiveRoutes } from './archive';
import { registerPriceRoutes } from './prices';
import { registerPlaygroundRoutes } from './playground';

/** All management endpoints, served under the `/admin` prefix (JSON bodies). */
export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (scope) => {
      registerAuthRoutes(scope);
      registerOAuthRoutes(scope);
      registerUserRoutes(scope);
      registerNodeRoutes(scope);
      registerProviderRoutes(scope);
      registerSettingsRoutes(scope);
      registerAnalyticsRoutes(scope);
      registerMcpRoutes(scope);
      registerSkillRoutes(scope);
      registerArchiveRoutes(scope);
      registerPriceRoutes(scope);
      registerPlaygroundRoutes(scope);
    },
    { prefix: '/admin' },
  );
}
