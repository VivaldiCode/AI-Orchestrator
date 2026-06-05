import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { config } from './config/index';
import { db } from './db/client';
import { AppError } from './lib/errors';
import { logger, loggerOptions } from './lib/logger';
import { AuthService } from './auth/service';
import { Orchestrator } from './orchestrator/index';
import { ProviderManager } from './providers/manager';
import { registerAuth } from './plugins/auth';
import { registerSecurity } from './plugins/security';
import { registerDocs } from './plugins/docs';
import { registerRealtime } from './realtime/route';
import { registerAdminRoutes } from './routes/admin/index';
import { registerProxyRoutes } from './routes/proxy';
import { APP_NAME, APP_VERSION } from './version';

/** Build and configure the Fastify app (without listening). Used by tests too. */
export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: loggerOptions,
    trustProxy: config.trustProxy,
    bodyLimit: 100 * 1024 * 1024, // up to 100 MB (model blob pushes)
  });

  app.decorate('orchestrator', new Orchestrator(db));
  app.decorate('providers', new ProviderManager(db));
  app.decorate('auth', new AuthService(db));

  app.setErrorHandler((err: FastifyError, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send(err.toBody());
    }
    if (err.statusCode === 429) {
      return reply.code(429).send({ error: 'too_many_requests', message: err.message });
    }
    if (err.validation) {
      return reply.code(400).send({ error: 'bad_request', message: err.message });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal_error', message: 'Internal server error.' });
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    version: APP_VERSION,
  }));
  app.get('/', async () => ({ name: APP_NAME, version: APP_VERSION, ok: true }));

  await registerSecurity(app);
  await registerAuth(app);
  await registerDocs(app);
  await registerRealtime(app);
  await registerAdminRoutes(app);
  await registerProxyRoutes(app);

  return app;
}

async function start(): Promise<void> {
  const app = await buildServer();
  await app.orchestrator.start();
  await app.providers.load();
  await app.listen({ host: config.host, port: config.port });
  logger.info(`AI Orchestrator listening on http://${config.host}:${config.port}`);

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    void (async () => {
      await app.orchestrator.stop();
      await app.close();
      process.exit(0);
    })();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  start().catch((err) => {
    logger.error({ err }, 'failed to start server');
    process.exit(1);
  });
}
