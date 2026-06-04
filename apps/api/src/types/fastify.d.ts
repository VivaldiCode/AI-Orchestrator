import type { preHandlerHookHandler } from 'fastify';
import type { Orchestrator } from '../orchestrator/index';
import type { ProviderManager } from '../providers/manager';
import type { AuthService } from '../auth/service';

declare module 'fastify' {
  interface FastifyInstance {
    orchestrator: Orchestrator;
    providers: ProviderManager;
    auth: AuthService;
    requireAdmin: preHandlerHookHandler;
    requireApiKey: preHandlerHookHandler;
  }

  interface FastifyRequest {
    clientKeyId?: string | null;
    adminUser?: { sub: string; username: string; role: string };
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; username: string; role: string; type: 'access' | 'refresh' };
    user: { sub: string; username: string; role: string; type: 'access' | 'refresh' };
  }
}
