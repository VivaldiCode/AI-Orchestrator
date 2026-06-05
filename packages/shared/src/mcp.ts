import { z } from 'zod';

/** How the orchestrator reaches an MCP server. */
export const mcpTransportSchema = z.enum(['http', 'stdio']);
export type McpTransport = z.infer<typeof mcpTransportSchema>;

const serverFields = {
  name: z.string().min(1).max(100),
  transport: mcpTransportSchema,
  /** HTTP transport: the server's base URL. */
  url: z.url().max(1000).nullable(),
  /** stdio transport: the command + args to spawn. */
  command: z.string().min(1).max(500).nullable(),
  args: z.array(z.string().max(500)).max(50),
  enabled: z.boolean(),
};

/** Payload to register an MCP server. `authToken` (HTTP bearer) travels inbound only. */
export const createMcpServerSchema = z.object({
  ...serverFields,
  url: serverFields.url.default(null),
  command: serverFields.command.default(null),
  args: serverFields.args.default([]),
  enabled: serverFields.enabled.default(true),
  authToken: z.string().max(2000).nullable().default(null),
});
export type CreateMcpServerInput = z.infer<typeof createMcpServerSchema>;

export const updateMcpServerSchema = z
  .object({ ...serverFields, authToken: z.string().max(2000).nullable() })
  .partial();
export type UpdateMcpServerInput = z.infer<typeof updateMcpServerSchema>;

/** A tool discovered on an MCP server, with its allowlist flag. */
export const mcpToolSchema = z.object({
  name: z.string(),
  description: z.string().nullable(),
  allowed: z.boolean(),
});
export type McpTool = z.infer<typeof mcpToolSchema>;

/** MCP server as returned to admins (never includes the auth token). */
export const mcpServerSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  transport: mcpTransportSchema,
  url: z.string().nullable(),
  command: z.string().nullable(),
  args: z.array(z.string()),
  enabled: z.boolean(),
  hasAuth: z.boolean(),
  tools: z.array(mcpToolSchema),
  lastError: z.string().nullable(),
  createdAt: z.string(),
});
export type McpServer = z.infer<typeof mcpServerSchema>;

/** Update which discovered tools are eligible for triage. */
export const setToolAllowSchema = z.object({
  tools: z.array(z.object({ name: z.string(), allowed: z.boolean() })),
});
export type SetToolAllowInput = z.infer<typeof setToolAllowSchema>;

// --- Skills ----------------------------------------------------------------

const skillFields = {
  name: z.string().min(1).max(100),
  description: z.string().max(1000),
  /** Task framing prepended as a system message when the skill is selected. */
  systemPrompt: z.string().max(20000),
  /** Preferred model/capability; overrides the request model when set. */
  modelHint: z.string().max(200).nullable(),
  /** Tool references: `serverName:toolName` or bare `toolName`. */
  toolPreset: z.array(z.string().min(1).max(200)).max(100),
  enabled: z.boolean(),
};

export const createSkillSchema = z.object({
  ...skillFields,
  description: skillFields.description.default(''),
  modelHint: skillFields.modelHint.default(null),
  toolPreset: skillFields.toolPreset.default([]),
  enabled: skillFields.enabled.default(true),
});
export type CreateSkillInput = z.infer<typeof createSkillSchema>;

export const updateSkillSchema = z.object(skillFields).partial();
export type UpdateSkillInput = z.infer<typeof updateSkillSchema>;

export const skillSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  systemPrompt: z.string(),
  modelHint: z.string().nullable(),
  toolPreset: z.array(z.string()),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type Skill = z.infer<typeof skillSchema>;
