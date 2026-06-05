import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SkillRow } from '../db/schema';
import type { TriageTool } from '../mcp/service';
import { runToolLoop, type ChatMessage, type ChatResponse } from './agent';
import { estimateRequestTokens } from './tokens';

/**
 * Opt-in triage step that runs before load-balancing. When enabled it enriches
 * a chat request: an explicitly requested Skill contributes a system prompt and
 * a preferred model, and allow-listed MCP tools are advertised to the model.
 *
 * Disabled (default) or non-chat requests pass through untouched. Clients can
 * also bypass per-request with the `x-triage: off` header.
 *
 * NOTE (phase 1): this *advertises* tools and applies the skill. The autonomous
 * loop that executes tool calls and feeds results back is phase 2.
 */

interface FunctionTool {
  type: 'function';
  function: { name: string; description?: string; parameters: unknown };
}

interface ChatBody {
  model?: string;
  messages?: unknown[];
  tools?: FunctionTool[];
  skill?: unknown;
  [key: string]: unknown;
}

function toFunctionTool(t: TriageTool): FunctionTool {
  return {
    type: 'function',
    function: {
      name: t.name,
      description: t.description ?? undefined,
      parameters: t.inputSchema,
    },
  };
}

function parseBody(req: FastifyRequest): ChatBody | null {
  const buf = req.body as Buffer | undefined;
  if (!buf || buf.length === 0) return null;
  try {
    return JSON.parse(buf.toString('utf8')) as ChatBody;
  } catch {
    return null;
  }
}

export async function triageChat(app: FastifyInstance, req: FastifyRequest): Promise<void> {
  const settings = app.orchestrator.getSettings();
  if (!settings.triageEnabled) return;
  if (req.headers['x-triage'] === 'off') return;

  const body = parseBody(req);
  if (!body || !Array.isArray(body.messages)) return; // chat only

  let preset: string[] | undefined;
  let modelHint: string | null = null;

  const skillName = typeof body.skill === 'string' ? body.skill : null;
  if (skillName) {
    const skill = await app.mcp.getEnabledSkillByName(skillName);
    if (skill) {
      body.messages = [{ role: 'system', content: skill.systemPrompt }, ...body.messages];
      modelHint = skill.modelHint;
      preset = skill.toolPreset?.length ? skill.toolPreset : undefined;
    }
    delete body.skill; // strip the non-standard field before forwarding
  }

  if (modelHint) body.model = modelHint;
  else if (settings.triageModel) body.model = settings.triageModel;

  const tools = await app.mcp.triageTools(preset);
  if (tools.length > 0) {
    const existing = Array.isArray(body.tools) ? body.tools : [];
    const have = new Set(existing.map((t) => t?.function?.name).filter(Boolean));
    const added = tools.filter((t) => !have.has(t.name)).map(toFunctionTool);
    if (added.length > 0) body.tools = [...existing, ...added];
  }

  (req as unknown as { body: Buffer }).body = Buffer.from(JSON.stringify(body));
}

/** Extract a plain-text result from an MCP tool's content blocks. */
function extractToolText(result: unknown): string {
  const r = result as { content?: { type?: string; text?: string }[] } | null;
  if (r?.content && Array.isArray(r.content)) {
    const text = r.content
      .filter((c) => c?.type === 'text' && typeof c.text === 'string')
      .map((c) => c.text)
      .join('\n');
    if (text) return text;
  }
  return JSON.stringify(result);
}

/** Resolve the skill: explicit `skill` field, else a keyword match by name. */
async function resolveSkill(
  app: FastifyInstance,
  body: ChatBody,
  messages: ChatMessage[],
): Promise<SkillRow | null> {
  if (typeof body.skill === 'string') return app.mcp.getEnabledSkillByName(body.skill);
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = typeof lastUser?.content === 'string' ? lastUser.content.toLowerCase() : '';
  if (!text) return null;
  const enabled = (await app.mcp.listSkills()).filter((s) => s.enabled);
  const hit = enabled.find((s) => text.includes(s.name.toLowerCase()));
  return hit ? app.mcp.getEnabledSkillByName(hit.name) : null;
}

/**
 * Phase 2: the autonomous tool-call loop. Engages only for triage-on,
 * non-streaming (`stream:false`) chat requests that resolve to eligible MCP
 * tools. Returns true when it has fully handled the response; false to let the
 * caller fall back to phase-1 enrichment + load-balanced proxy.
 */
export async function runTriageAgent(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  const settings = app.orchestrator.getSettings();
  if (!settings.triageEnabled) return false;
  if (req.headers['x-triage'] === 'off') return false;

  const body = parseBody(req);
  if (!body || !Array.isArray(body.messages)) return false;
  if (body.stream !== false) return false; // the loop needs full (non-streamed) responses

  const messages = body.messages as ChatMessage[];
  const skill = await resolveSkill(app, body, messages);
  const preset = skill?.toolPreset?.length ? skill.toolPreset : undefined;
  const tools = await app.mcp.triageTools(preset);
  if (tools.length === 0) return false; // no tools → nothing to loop on

  const toolServer = new Map(tools.map((t) => [t.name, t.serverId]));
  const fnTools = tools.map(toFunctionTool);
  const model =
    skill?.modelHint || settings.triageModel || (typeof body.model === 'string' ? body.model : '');

  const baseMessages: ChatMessage[] = skill
    ? [{ role: 'system', content: skill.systemPrompt }, ...messages]
    : messages;

  // Forward any other body options (temperature, etc.), but control the rest.
  const { skill: _skill, messages: _m, stream: _s, model: _mod, tools: _t, ...rest } = body;

  const { response } = await runToolLoop(
    {
      maxToolCalls: settings.maxToolCalls,
      callModel: (msgs) =>
        app.orchestrator.dispatcher.chatOnce(
          model || null,
          { ...rest, model, messages: msgs, tools: fnTools },
          estimateRequestTokens({ messages: msgs }),
        ) as Promise<ChatResponse>,
      callTool: async (name, args) => {
        const serverId = toolServer.get(name);
        if (!serverId) return `Unknown tool: ${name}`;
        return extractToolText(await app.mcp.callServerTool(serverId, name, args));
      },
    },
    baseMessages,
  );

  await reply.send(response);
  return true;
}
