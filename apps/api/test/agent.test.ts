import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { runToolLoop, type ChatMessage, type ChatResponse } from '../src/orchestrator/agent';
import { callTool } from '../src/mcp/client';

function scriptedModel(responses: ChatResponse[]) {
  let i = 0;
  return vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
}

const toolCallMsg = (name: string, args?: Record<string, unknown>): ChatResponse => ({
  message: { role: 'assistant', tool_calls: [{ function: { name, arguments: args } }] },
});

describe('runToolLoop', () => {
  it('returns immediately when the model asks for no tools', async () => {
    const callModel = scriptedModel([{ message: { role: 'assistant', content: 'hello' } }]);
    const callTool = vi.fn();
    const r = await runToolLoop({ callModel, callTool, maxToolCalls: 5 }, [
      { role: 'user', content: 'hi' },
    ]);
    expect(r.response.message?.content).toBe('hello');
    expect(r.toolCalls).toBe(0);
    expect(callModel).toHaveBeenCalledTimes(1);
    expect(callTool).not.toHaveBeenCalled();
  });

  it('executes a tool call, feeds the result back, then finishes', async () => {
    const callModel = scriptedModel([
      toolCallMsg('echo', { x: 1 }),
      { message: { role: 'assistant', content: 'done' } },
    ]);
    const callTool = vi.fn(async () => 'tool-result');
    const r = await runToolLoop({ callModel, callTool, maxToolCalls: 5 }, [
      { role: 'user', content: 'hi' },
    ]);
    expect(r.response.message?.content).toBe('done');
    expect(r.toolCalls).toBe(1);
    expect(callTool).toHaveBeenCalledWith('echo', { x: 1 });
    expect(r.messages.some((m) => m.role === 'tool' && m.content === 'tool-result')).toBe(true);
  });

  it('stops at maxToolCalls even if the model keeps asking', async () => {
    const callModel = vi.fn(async () => toolCallMsg('loop'));
    const callTool = vi.fn(async () => 'r');
    const r = await runToolLoop({ callModel, callTool, maxToolCalls: 2 }, [
      { role: 'user', content: 'go' },
    ]);
    expect(r.toolCalls).toBe(2);
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it('surfaces a tool error and keeps going', async () => {
    const callModel = scriptedModel([
      toolCallMsg('boom'),
      { message: { role: 'assistant', content: 'recovered' } },
    ]);
    const callTool = vi.fn(async () => {
      throw new Error('kaboom');
    });
    const r = await runToolLoop({ callModel, callTool, maxToolCalls: 5 }, [
      { role: 'user', content: 'hi' },
    ]);
    expect(r.response.message?.content).toBe('recovered');
    expect(
      r.messages.some((m) => m.role === 'tool' && /Tool error: kaboom/.test(String(m.content))),
    ).toBe(true);
  });
});

// The loop driving a real MCP tool (SDK server over HTTP) end-to-end.
describe('runToolLoop with a real MCP tool', () => {
  let http: Server;
  let url: string;

  beforeAll(async () => {
    http = createServer((req, res) => {
      const server = new McpServer({ name: 'mock-mcp', version: '1.0.0' });
      server.registerTool(
        'echo',
        { description: 'Echo', inputSchema: { value: z.string() } },
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

  it('calls the model, runs the MCP tool, and answers from its result', async () => {
    let turn = 0;
    const callModel = async (messages: ChatMessage[]): Promise<ChatResponse> => {
      turn++;
      if (turn === 1) return toolCallMsg('echo', { value: 'hi' });
      const toolMsg = messages.find((m) => m.role === 'tool');
      return { message: { role: 'assistant', content: `final:${toolMsg?.content ?? ''}` } };
    };
    const exec = async (name: string, args: Record<string, unknown>): Promise<string> => {
      const result = (await callTool({ transport: 'http', url }, name, args)) as {
        content: { text: string }[];
      };
      return result.content[0].text;
    };
    const r = await runToolLoop({ callModel, callTool: exec, maxToolCalls: 3 }, [
      { role: 'user', content: 'echo hi please' },
    ]);
    expect(r.response.message?.content).toBe('final:echo:hi');
    expect(r.toolCalls).toBe(1);
  });
}, 20000);
