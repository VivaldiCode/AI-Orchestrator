import type { preHandlerHookHandler } from 'fastify';
import type { Permission } from '@ai-orchestrator/shared';
import type { Orchestrator } from '../orchestrator/index';
import type { ProviderManager } from '../providers/manager';
import type { AuthService } from '../auth/service';
import type { OAuthService } from '../auth/oauth';
import type { McpService } from '../mcp/service';
import type { RequestArchive } from '../archive/index';
import type { PriceBook } from '../cost/pricebook';
import type { XaiSubscriptionService } from '../providers/xaiSubscription';

declare module 'fastify' {
  interface FastifyInstance {
    orchestrator: Orchestrator;
    providers: ProviderManager;
    auth: AuthService;
    oauth: OAuthService;
    mcp: McpService;
    archive: RequestArchive;
    prices: PriceBook;
    xaiSubscription: XaiSubscriptionService;
    requireAdmin: preHandlerHookHandler;
    requireUser: preHandlerHookHandler;
    requireApiKey: preHandlerHookHandler;
    requirePermission: (permission: Permission) => preHandlerHookHandler;
  }

  interface FastifyRequest {
    clientKeyId?: string | null;
    adminUser?: { sub: string; username: string; role: string };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      username: string;
      role: string;
      perms?: string[];
      type: 'access' | 'refresh';
    };
    user: {
      sub: string;
      username: string;
      role: string;
      perms?: string[];
      type: 'access' | 'refresh';
    };
  }
}
