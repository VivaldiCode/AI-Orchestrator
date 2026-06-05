import { eq } from 'drizzle-orm';
import type {
  CreateMcpServerInput,
  CreateSkillInput,
  McpServer,
  McpTransport,
  SetToolAllowInput,
  Skill,
  UpdateMcpServerInput,
  UpdateSkillInput,
} from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { mcpServers, skills, type McpServerRow, type SkillRow } from '../db/schema';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { notFound } from '../lib/errors';
import { callTool, listTools, type McpTarget } from './client';

/** Internal tool shape persisted on the server row (includes the JSON schema). */
interface StoredTool {
  name: string;
  description: string | null;
  allowed: boolean;
  inputSchema?: unknown;
}

/** A triage-eligible tool resolved across enabled servers. */
export interface TriageTool {
  serverId: string;
  serverName: string;
  name: string;
  description: string | null;
  inputSchema: unknown;
}

/** MCP server registry, tool discovery/allowlist, and the Skills registry. */
export class McpService {
  constructor(private readonly db: DB) {}

  // --- servers -------------------------------------------------------------

  async listServers(): Promise<McpServer[]> {
    const rows = await this.db.select().from(mcpServers).orderBy(mcpServers.createdAt);
    return rows.map((r) => this.toServer(r));
  }

  async getServerRow(id: string): Promise<McpServerRow | null> {
    const [row] = await this.db.select().from(mcpServers).where(eq(mcpServers.id, id)).limit(1);
    return row ?? null;
  }

  async createServer(input: CreateMcpServerInput): Promise<McpServer> {
    const [row] = await this.db
      .insert(mcpServers)
      .values({
        name: input.name,
        transport: input.transport,
        url: input.url,
        command: input.command,
        args: input.args,
        enabled: input.enabled,
        authEncrypted: input.authToken ? encryptSecret(input.authToken) : null,
      })
      .returning();
    return this.toServer(row);
  }

  async updateServer(id: string, patch: UpdateMcpServerInput): Promise<McpServer> {
    const current = await this.getServerRow(id);
    if (!current) throw notFound('MCP server not found.');
    const values: Partial<typeof mcpServers.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.transport !== undefined) values.transport = patch.transport;
    if (patch.url !== undefined) values.url = patch.url;
    if (patch.command !== undefined) values.command = patch.command;
    if (patch.args !== undefined) values.args = patch.args;
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.authToken !== undefined) {
      values.authEncrypted = patch.authToken ? encryptSecret(patch.authToken) : null;
    }
    const [row] = await this.db
      .update(mcpServers)
      .set(values)
      .where(eq(mcpServers.id, id))
      .returning();
    return this.toServer(row);
  }

  async deleteServer(id: string): Promise<void> {
    await this.db.delete(mcpServers).where(eq(mcpServers.id, id));
  }

  /** Connect and refresh the server's tool list, preserving allow flags. */
  async discover(id: string): Promise<McpServer> {
    const row = await this.getServerRow(id);
    if (!row) throw notFound('MCP server not found.');
    try {
      const discovered = await listTools(this.targetFor(row));
      const prevAllowed = new Map((row.tools ?? []).map((t) => [t.name, t.allowed]));
      const tools: StoredTool[] = discovered.map((d) => ({
        name: d.name,
        description: d.description,
        inputSchema: d.inputSchema,
        allowed: prevAllowed.get(d.name) ?? true,
      }));
      const [updated] = await this.db
        .update(mcpServers)
        .set({ tools, lastError: null, updatedAt: new Date() })
        .where(eq(mcpServers.id, id))
        .returning();
      return this.toServer(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'discovery failed';
      const [updated] = await this.db
        .update(mcpServers)
        .set({ lastError: message, updatedAt: new Date() })
        .where(eq(mcpServers.id, id))
        .returning();
      return this.toServer(updated);
    }
  }

  async setToolAllow(id: string, input: SetToolAllowInput): Promise<McpServer> {
    const row = await this.getServerRow(id);
    if (!row) throw notFound('MCP server not found.');
    const flags = new Map(input.tools.map((t) => [t.name, t.allowed]));
    const tools: StoredTool[] = (row.tools ?? []).map((t) => ({
      ...t,
      allowed: flags.has(t.name) ? (flags.get(t.name) as boolean) : t.allowed,
    }));
    const [updated] = await this.db
      .update(mcpServers)
      .set({ tools, updatedAt: new Date() })
      .where(eq(mcpServers.id, id))
      .returning();
    return this.toServer(updated);
  }

  /** Invoke a tool on a server (admin-gated; returns the raw MCP result). */
  async callServerTool(id: string, name: string, args: Record<string, unknown>): Promise<unknown> {
    const row = await this.getServerRow(id);
    if (!row) throw notFound('MCP server not found.');
    return callTool(this.targetFor(row), name, args);
  }

  /** Allowed tools across enabled servers, optionally filtered by skill preset. */
  async triageTools(preset?: string[]): Promise<TriageTool[]> {
    const rows = await this.db.select().from(mcpServers).where(eq(mcpServers.enabled, true));
    const wanted = preset && preset.length > 0 ? new Set(preset) : null;
    const out: TriageTool[] = [];
    for (const row of rows) {
      for (const tool of (row.tools ?? []) as StoredTool[]) {
        if (!tool.allowed) continue;
        if (wanted && !wanted.has(tool.name) && !wanted.has(`${row.name}:${tool.name}`)) continue;
        out.push({
          serverId: row.id,
          serverName: row.name,
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? { type: 'object' },
        });
      }
    }
    return out;
  }

  private targetFor(row: McpServerRow): McpTarget {
    return {
      transport: row.transport as McpTarget['transport'],
      url: row.url,
      command: row.command,
      args: row.args ?? [],
      authToken: row.authEncrypted ? decryptSecret(row.authEncrypted) : null,
    };
  }

  private toServer(row: McpServerRow): McpServer {
    return {
      id: row.id,
      name: row.name,
      transport: row.transport as McpTransport,
      url: row.url,
      command: row.command,
      args: row.args ?? [],
      enabled: row.enabled,
      hasAuth: !!row.authEncrypted,
      tools: ((row.tools ?? []) as StoredTool[]).map((t) => ({
        name: t.name,
        description: t.description,
        allowed: t.allowed,
      })),
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- skills --------------------------------------------------------------

  async listSkills(): Promise<Skill[]> {
    const rows = await this.db.select().from(skills).orderBy(skills.createdAt);
    return rows.map((r) => this.toSkill(r));
  }

  async getSkillRow(id: string): Promise<SkillRow | null> {
    const [row] = await this.db.select().from(skills).where(eq(skills.id, id)).limit(1);
    return row ?? null;
  }

  /** Find an enabled skill by name (used by triage for explicit selection). */
  async getEnabledSkillByName(name: string): Promise<SkillRow | null> {
    const [row] = await this.db.select().from(skills).where(eq(skills.name, name)).limit(1);
    return row && row.enabled ? row : null;
  }

  async createSkill(input: CreateSkillInput): Promise<Skill> {
    const [row] = await this.db
      .insert(skills)
      .values({
        name: input.name,
        description: input.description,
        systemPrompt: input.systemPrompt,
        modelHint: input.modelHint,
        toolPreset: input.toolPreset,
        enabled: input.enabled,
      })
      .returning();
    return this.toSkill(row);
  }

  async updateSkill(id: string, patch: UpdateSkillInput): Promise<Skill> {
    const current = await this.getSkillRow(id);
    if (!current) throw notFound('Skill not found.');
    const values: Partial<typeof skills.$inferInsert> = { updatedAt: new Date() };
    if (patch.name !== undefined) values.name = patch.name;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.systemPrompt !== undefined) values.systemPrompt = patch.systemPrompt;
    if (patch.modelHint !== undefined) values.modelHint = patch.modelHint;
    if (patch.toolPreset !== undefined) values.toolPreset = patch.toolPreset;
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    const [row] = await this.db.update(skills).set(values).where(eq(skills.id, id)).returning();
    return this.toSkill(row);
  }

  async deleteSkill(id: string): Promise<void> {
    await this.db.delete(skills).where(eq(skills.id, id));
  }

  private toSkill(row: SkillRow): Skill {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      systemPrompt: row.systemPrompt,
      modelHint: row.modelHint,
      toolPreset: row.toolPreset ?? [],
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
