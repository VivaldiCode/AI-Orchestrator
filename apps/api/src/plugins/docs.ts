import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { openapiDocument } from '../openapi';

/** Serves a curated OpenAPI spec at /openapi.json and Swagger UI at /docs. */
export async function registerDocs(app: FastifyInstance): Promise<void> {
  await app.register(swagger, { mode: 'static', specification: { document: openapiDocument } });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, persistAuthorization: true },
  });
  app.get('/openapi.json', async () => openapiDocument);
}
