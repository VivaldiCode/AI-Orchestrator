import type { OpenAPIV3 } from 'openapi-types';
import { APP_VERSION } from './version';

const jsonObject: OpenAPIV3.SchemaObject = { type: 'object', additionalProperties: true };

const ok = (description: string): OpenAPIV3.ResponseObject => ({ description });

const idParam: OpenAPIV3.ParameterObject = {
  name: 'id',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

/**
 * Hand-authored OpenAPI 3.0 spec. The proxy routes stream and hijack responses,
 * so a curated document gives a far cleaner reference than schema auto-generation.
 */
export const openapiDocument: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'AI Orchestrator API',
    version: APP_VERSION,
    description:
      'Self-hosted gateway that mirrors the Ollama API and load-balances inference across your ' +
      'Macs and cloud providers.\n\n' +
      '- **Ollama mirror** (`/api/*`) — drop-in, load-balanced, streaming.\n' +
      '- **OpenAI-compatible** (`/v1/*`) — routes to the cluster or to a cloud provider.\n' +
      '- **Management** (`/admin/*`) — dashboard API (JWT).\n\n' +
      'Inference is open until the first API key is created, then a `Bearer` key is required.',
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:11435', description: 'Local orchestrator' },
    { url: '/', description: 'Same origin' },
  ],
  tags: [
    { name: 'Health', description: 'Liveness and version' },
    { name: 'Ollama', description: 'Drop-in mirror of the Ollama REST API (load-balanced)' },
    { name: 'OpenAI', description: 'OpenAI-compatible /v1 surface' },
    { name: 'Auth', description: 'Dashboard authentication and API keys' },
    { name: 'Nodes', description: 'Manage Ollama nodes (your Macs)' },
    { name: 'Providers', description: 'Cloud providers and the model registry' },
    { name: 'Settings', description: 'Orchestrator settings' },
    { name: 'Analytics', description: 'Usage metrics' },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'http',
        scheme: 'bearer',
        description:
          'Inference API key issued in the dashboard (Authorization: Bearer aio_live_…).',
      },
      AdminAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Dashboard access token from /admin/auth/login.',
      },
    },
    schemas: {
      ChatRequest: {
        type: 'object',
        required: ['model', 'messages'],
        properties: {
          model: { type: 'string', example: 'llama3.2' },
          stream: { type: 'boolean', default: true },
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['system', 'user', 'assistant'] },
                content: { type: 'string' },
              },
            },
          },
        },
      },
      Credentials: {
        type: 'object',
        required: ['username', 'password'],
        properties: {
          username: { type: 'string', minLength: 3, example: 'admin' },
          password: { type: 'string', minLength: 12, example: 'change-me-please-1' },
        },
      },
      CreateNode: {
        type: 'object',
        required: ['name', 'host'],
        properties: {
          name: { type: 'string', example: 'studio' },
          host: { type: 'string', example: '192.168.0.21' },
          port: { type: 'integer', default: 11434 },
          protocol: { type: 'string', enum: ['http', 'https'], default: 'http' },
          weight: { type: 'integer', default: 1 },
          enabled: { type: 'boolean', default: true },
          maxConcurrency: { type: 'integer', default: 4 },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
  },
  paths: {
    '/healthz': {
      get: {
        tags: ['Health'],
        summary: 'Liveness probe',
        responses: { '200': ok('Service is healthy') },
      },
    },
    '/api/version': {
      get: {
        tags: ['Health'],
        summary: 'Orchestrator version (open, no auth)',
        responses: { '200': ok('Version info') },
      },
    },
    '/api/chat': {
      post: {
        tags: ['Ollama'],
        summary: 'Chat completion — load-balanced across nodes',
        description:
          'Mirror of Ollama `POST /api/chat`. Streams NDJSON unless `stream:false`. The response ' +
          'carries an `X-Orchestrator-Node-Name` header identifying the node that served it.',
        security: [{ ApiKeyAuth: [] }, {}],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatRequest' } } },
        },
        responses: {
          '200': ok('Chat response (NDJSON stream or single JSON)'),
          '503': ok('No healthy nodes available'),
        },
      },
    },
    '/api/generate': {
      post: {
        tags: ['Ollama'],
        summary: 'Generate a completion — load-balanced',
        security: [{ ApiKeyAuth: [] }, {}],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '200': ok('Generation response') },
      },
    },
    '/api/embed': {
      post: {
        tags: ['Ollama'],
        summary: 'Generate embeddings — load-balanced',
        security: [{ ApiKeyAuth: [] }, {}],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '200': ok('Embeddings') },
      },
    },
    '/api/tags': {
      get: {
        tags: ['Ollama'],
        summary: 'List available models (union across all nodes)',
        security: [{ ApiKeyAuth: [] }, {}],
        responses: { '200': ok('Aggregated model list') },
      },
    },
    '/api/ps': {
      get: {
        tags: ['Ollama'],
        summary: 'List loaded models across nodes',
        security: [{ ApiKeyAuth: [] }, {}],
        responses: { '200': ok('Loaded models') },
      },
    },
    '/api/pull': {
      post: {
        tags: ['Ollama'],
        summary: 'Pull a model on a node',
        description:
          'Targets a single node. Choose it with `?node=<id>`, otherwise the first healthy node.',
        security: [{ ApiKeyAuth: [] }, {}],
        parameters: [{ name: 'node', in: 'query', required: false, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '200': ok('Pull progress (NDJSON stream)') },
      },
    },
    '/v1/chat/completions': {
      post: {
        tags: ['OpenAI'],
        summary: 'OpenAI-compatible chat completions',
        description: 'Routes to the local cluster, or to a cloud provider via the model registry.',
        security: [{ ApiKeyAuth: [] }, {}],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ChatRequest' } } },
        },
        responses: { '200': ok('Chat completion') },
      },
    },
    '/v1/models': {
      get: {
        tags: ['OpenAI'],
        summary: 'List models (OpenAI shape)',
        security: [{ ApiKeyAuth: [] }, {}],
        responses: { '200': ok('Model list') },
      },
    },
    '/admin/auth/setup-status': {
      get: {
        tags: ['Auth'],
        summary: 'Whether first-run setup is needed',
        responses: { '200': ok('Status') },
      },
    },
    '/admin/auth/setup': {
      post: {
        tags: ['Auth'],
        summary: 'Create the first admin account',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: { '201': ok('Admin created + tokens'), '409': ok('Admin already exists') },
      },
    },
    '/admin/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and receive tokens',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Credentials' } } },
        },
        responses: { '200': ok('Token pair'), '401': ok('Invalid credentials') },
      },
    },
    '/admin/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Exchange a refresh token for new tokens',
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '200': ok('Token pair') },
      },
    },
    '/admin/nodes': {
      get: {
        tags: ['Nodes'],
        summary: 'List nodes with live runtime',
        security: [{ AdminAuth: [] }],
        responses: { '200': ok('Nodes') },
      },
      post: {
        tags: ['Nodes'],
        summary: 'Register a node',
        security: [{ AdminAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateNode' } } },
        },
        responses: { '201': ok('Created') },
      },
    },
    '/admin/nodes/{id}': {
      patch: {
        tags: ['Nodes'],
        summary: 'Update a node',
        security: [{ AdminAuth: [] }],
        parameters: [idParam],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '200': ok('Updated'), '404': ok('Not found') },
      },
      delete: {
        tags: ['Nodes'],
        summary: 'Delete a node',
        security: [{ AdminAuth: [] }],
        parameters: [idParam],
        responses: { '204': ok('Deleted') },
      },
    },
    '/admin/nodes/{id}/test': {
      post: {
        tags: ['Nodes'],
        summary: 'Test connectivity to a node',
        security: [{ AdminAuth: [] }],
        parameters: [idParam],
        responses: { '200': ok('Test result') },
      },
    },
    '/admin/providers': {
      get: {
        tags: ['Providers'],
        summary: 'List providers (no secrets)',
        security: [{ AdminAuth: [] }],
        responses: { '200': ok('Providers') },
      },
      post: {
        tags: ['Providers'],
        summary: 'Add a provider (credentials encrypted at rest)',
        security: [{ AdminAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '201': ok('Created') },
      },
    },
    '/admin/model-routes': {
      get: {
        tags: ['Providers'],
        summary: 'List model registry entries',
        security: [{ AdminAuth: [] }],
        responses: { '200': ok('Routes') },
      },
      post: {
        tags: ['Providers'],
        summary: 'Map a model alias to a provider + target model',
        security: [{ AdminAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '201': ok('Created') },
      },
    },
    '/admin/settings': {
      get: {
        tags: ['Settings'],
        summary: 'Get orchestrator settings',
        security: [{ AdminAuth: [] }],
        responses: { '200': ok('Settings') },
      },
      put: {
        tags: ['Settings'],
        summary: 'Update orchestrator settings',
        security: [{ AdminAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '200': ok('Updated') },
      },
    },
    '/admin/analytics': {
      get: {
        tags: ['Analytics'],
        summary: 'Usage summary + time series',
        security: [{ AdminAuth: [] }],
        parameters: [
          {
            name: 'bucket',
            in: 'query',
            schema: { type: 'string', enum: ['1m', '5m', '1h', '1d'] },
          },
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date-time' } },
        ],
        responses: { '200': ok('Analytics summary') },
      },
    },
    '/admin/api-keys': {
      get: {
        tags: ['Auth'],
        summary: 'List API keys',
        security: [{ AdminAuth: [] }],
        responses: { '200': ok('Keys') },
      },
      post: {
        tags: ['Auth'],
        summary: 'Create an API key (secret shown once)',
        security: [{ AdminAuth: [] }],
        requestBody: { required: true, content: { 'application/json': { schema: jsonObject } } },
        responses: { '201': ok('Created (includes secret)') },
      },
    },
    '/admin/api-keys/{id}': {
      delete: {
        tags: ['Auth'],
        summary: 'Revoke an API key',
        security: [{ AdminAuth: [] }],
        parameters: [idParam],
        responses: { '204': ok('Revoked') },
      },
    },
  },
};
