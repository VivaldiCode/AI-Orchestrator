import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { APP_NAME, APP_VERSION } from '../version';

/** Thin wrapper over the official MCP SDK: connect, list tools, call a tool. */

const OP_TIMEOUT_MS = 15000;

export interface McpTarget {
  transport: 'http' | 'stdio';
  url?: string | null;
  command?: string | null;
  args?: string[];
  authToken?: string | null;
}

export interface DiscoveredTool {
  name: string;
  description: string | null;
  inputSchema: unknown;
}

function buildTransport(target: McpTarget) {
  if (target.transport === 'http') {
    if (!target.url) throw new Error('HTTP MCP server requires a URL.');
    const requestInit = target.authToken
      ? { headers: { authorization: `Bearer ${target.authToken}` } }
      : undefined;
    return new StreamableHTTPClientTransport(
      new URL(target.url),
      requestInit ? { requestInit } : undefined,
    );
  }
  if (!target.command) throw new Error('stdio MCP server requires a command.');
  return new StdioClientTransport({ command: target.command, args: target.args ?? [] });
}

async function withClient<T>(target: McpTarget, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ name: APP_NAME, version: APP_VERSION }, { capabilities: {} });
  const transport = buildTransport(target);
  const run = (async () => {
    await client.connect(transport);
    try {
      return await fn(client);
    } finally {
      await client.close().catch(() => {});
    }
  })();

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('MCP operation timed out')), OP_TIMEOUT_MS);
  });
  try {
    return await Promise.race([run, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function listTools(target: McpTarget): Promise<DiscoveredTool[]> {
  return withClient(target, async (client) => {
    const res = await client.listTools();
    return (res.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? null,
      inputSchema: t.inputSchema ?? { type: 'object' },
    }));
  });
}

export async function callTool(
  target: McpTarget,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withClient(target, async (client) => client.callTool({ name, arguments: args }));
}
