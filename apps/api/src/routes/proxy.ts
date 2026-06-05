import type { FastifyInstance } from 'fastify';
import { registerOllamaRoutes } from './ollama/index';
import { registerOpenAIRoutes } from './openai/index';

/**
 * Registers the pass-through proxy surface (Ollama mirror + OpenAI `/v1`) in an
 * encapsulated scope whose body parser keeps the raw bytes as a Buffer, so we
 * can both inspect the request (to read the model) and forward it verbatim.
 */
export async function registerProxyRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (scope) => {
    // Drop inherited parsers (notably Fastify's built-in application/json, which
    // would otherwise turn the body into an object) so EVERY content type is kept
    // as raw bytes — letting us read the model and forward the JSON verbatim.
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'buffer' }, (_req, body, done) => {
      done(null, body);
    });
    registerOllamaRoutes(scope);
    registerOpenAIRoutes(scope);
  });
}
