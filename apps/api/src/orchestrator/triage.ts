import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { TriageTool } from '../mcp/service';

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
