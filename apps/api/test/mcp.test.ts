import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServerSchema, createSkillSchema } from '@ai-orchestrator/shared';
import { callTool, listTools } from '../src/mcp/client';

describe('MCP/Skills schemas', () => {
  it('defaults MCP server fields', () => {
    const s = createMcpServerSchema.parse({
      name: 'fs',
      transport: 'http',
      url: 'http://localhost:9',
    });
    expect(s.enabled).toBe(true);
    expect(s.args).toEqual([]);
    expect(s.authToken).toBeNull();
  });

  it('defaults skill fields', () => {
    const s = createSkillSchema.parse({ name: 'sql', systemPrompt: 'analyze' });
    expect(s.toolPreset).toEqual([]);
    expect(s.modelHint).toBeNull();
    expect(s.enabled).toBe(true);
  });

  it('rejects a non-URL MCP server url', () => {
    expect(
      createMcpServerSchema.safeParse({ name: 'x', transport: 'http', url: 'nope' }).success,
    ).toBe(false);
  });
});

// Real protocol round-trip: an SDK-built MCP server over HTTP, driven by our
// own client wrapper (lib/mcp/client.ts).
describe('MCP client over HTTP (real SDK server)', () => {
  let http: Server;
  let url: string;

  beforeAll(async () => {
    http = createServer((req, res) => {
      // Stateless: a fresh server+transport per request (per SDK guidance).
      const server = new McpServer({ name: 'mock-mcp', version: '1.0.0' });
      server.registerTool(
        'echo',
        { description: 'Echo the input back', inputSchema: { value: z.string() } },
        async ({ value }) => ({ content: [{ type: 'text', text: `echo:${value}` }] }),
      );
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        void transport.close();
        void server.close();
      });
      server
        .connect(transport)
        .then(() => transport.handleRequest(req, res))
        .catch(() => {
          if (!res.headersSent) res.writeHead(500).end();
        });
    });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    const addr = http.address();
    url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}/`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => http.close(() => resolve()));
  });

  it('discovers tools', async () => {
    const tools = await listTools({ transport: 'http', url });
    expect(tools.map((t) => t.name)).toContain('echo');
  });

  it('calls a tool and gets the result', async () => {
    const result = (await callTool({ transport: 'http', url }, 'echo', { value: 'hi' })) as {
      content: { type: string; text: string }[];
    };
    expect(result.content[0].text).toBe('echo:hi');
  });
}, 20000);
