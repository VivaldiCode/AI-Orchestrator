import { describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Settings } from '@ai-orchestrator/shared';
import { triageChat } from '../src/orchestrator/triage';
import type { TriageTool } from '../src/mcp/service';

const BASE: Settings = {
  strategy: 'least-connections',
  modelAware: true,
  contextAware: true,
  autoPull: false,
  failoverRetries: 2,
  triageEnabled: false,
  triageModel: '',
  maxToolCalls: 5,
  requestLogMax: 0,
  cloudOverflow: false,
  cloudOverflowProviderId: '',
  embedOverflow: false,
  embedOverflowProviderId: '',
  embedOverflowModel: '',
  privacyMode: false,
};

interface SkillStub {
  systemPrompt: string;
  modelHint: string | null;
  toolPreset: string[];
  enabled: boolean;
}

function makeApp(
  settings: Partial<Settings>,
  opts: { skill?: SkillStub | null; tools?: TriageTool[] } = {},
): FastifyInstance {
  return {
    orchestrator: { getSettings: () => ({ ...BASE, ...settings }) },
    mcp: {
      getEnabledSkillByName: async () => opts.skill ?? null,
      triageTools: async () => opts.tools ?? [],
    },
  } as unknown as FastifyInstance;
}

function makeReq(body: unknown, headers: Record<string, string> = {}): FastifyRequest {
  return { headers, body: Buffer.from(JSON.stringify(body)) } as unknown as FastifyRequest;
}

function bodyOf(req: FastifyRequest): Record<string, unknown> {
  return JSON.parse((req.body as Buffer).toString('utf8'));
}

const tool = (name: string): TriageTool => ({
  serverId: 's1',
  serverName: 'srv',
  name,
  description: `${name} tool`,
  inputSchema: { type: 'object' },
});

describe('triageChat', () => {
  it('passes through when triage is disabled', async () => {
    const req = makeReq({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    await triageChat(makeApp({ triageEnabled: false }, { tools: [tool('t')] }), req);
    const b = bodyOf(req);
    expect(b.tools).toBeUndefined();
    expect((b.messages as unknown[]).length).toBe(1);
  });

  it('respects the x-triage: off bypass header', async () => {
    const req = makeReq(
      { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      { 'x-triage': 'off' },
    );
    await triageChat(makeApp({ triageEnabled: true }, { tools: [tool('t')] }), req);
    expect(bodyOf(req).tools).toBeUndefined();
  });

  it('ignores non-chat requests (no messages array)', async () => {
    const req = makeReq({ model: 'm', prompt: 'hello' });
    await triageChat(makeApp({ triageEnabled: true }, { tools: [tool('t')] }), req);
    expect(bodyOf(req).tools).toBeUndefined();
  });

  it('attaches allow-listed MCP tools when enabled', async () => {
    const req = makeReq({ model: 'm', messages: [{ role: 'user', content: 'hi' }] });
    await triageChat(makeApp({ triageEnabled: true }, { tools: [tool('a'), tool('b')] }), req);
    const tools = bodyOf(req).tools as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toEqual(['a', 'b']);
  });

  it('applies a selected skill: system prompt, model, tools; strips the field', async () => {
    const req = makeReq({
      model: 'orig',
      skill: 'sql-analyst',
      messages: [{ role: 'user', content: 'count rows' }],
    });
    const app = makeApp(
      { triageEnabled: true },
      {
        skill: {
          systemPrompt: 'You analyze SQL.',
          modelHint: 'big-model',
          toolPreset: ['query'],
          enabled: true,
        },
        tools: [tool('query')],
      },
    );
    await triageChat(app, req);
    const b = bodyOf(req);
    const messages = b.messages as { role: string; content: string }[];
    expect(messages[0]).toEqual({ role: 'system', content: 'You analyze SQL.' });
    expect(messages[1].content).toBe('count rows');
    expect(b.model).toBe('big-model');
    expect(b.skill).toBeUndefined();
    expect((b.tools as { function: { name: string } }[])[0].function.name).toBe('query');
  });

  it('does not duplicate tools already present in the request', async () => {
    const req = makeReq({
      model: 'm',
      messages: [{ role: 'user', content: 'hi' }],
      tools: [{ type: 'function', function: { name: 'a', parameters: {} } }],
    });
    await triageChat(makeApp({ triageEnabled: true }, { tools: [tool('a'), tool('b')] }), req);
    const tools = bodyOf(req).tools as { function: { name: string } }[];
    expect(tools.map((t) => t.function.name)).toEqual(['a', 'b']);
  });
});
