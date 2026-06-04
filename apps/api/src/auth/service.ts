import { eq, sql as dsql } from 'drizzle-orm';
import type { ApiKey, ApiKeyCreated, ApiKeyScope, User } from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { apiKeys, users, type ApiKeyRow, type UserRow } from '../db/schema';
import { conflict, unauthorized } from '../lib/errors';
import { generateApiKey, hashApiKey, hashPassword, verifyPassword } from '../lib/crypto';
import { logger } from '../lib/logger';

/** User accounts (dashboard) and API keys (inference clients). */
export class AuthService {
  constructor(private readonly db: DB) {}

  /** True when no users exist yet (first-run setup is needed). */
  async needsSetup(): Promise<boolean> {
    const rows = await this.db.select({ id: users.id }).from(users).limit(1);
    return rows.length === 0;
  }

  async createAdmin(username: string, password: string): Promise<User> {
    if (!(await this.needsSetup())) throw conflict('An admin user already exists.');
    const passwordHash = await hashPassword(password);
    const [row] = await this.db
      .insert(users)
      .values({ username, passwordHash, role: 'admin' })
      .returning();
    return this.toUser(row);
  }

  async login(username: string, password: string): Promise<UserRow> {
    const [row] = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!row) throw unauthorized('Invalid credentials.');
    const ok = await verifyPassword(password, row.passwordHash);
    if (!ok) throw unauthorized('Invalid credentials.');
    return row;
  }

  toUser(row: UserRow): User {
    return {
      id: row.id,
      username: row.username,
      role: row.role as User['role'],
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- API keys ------------------------------------------------------------

  async apiKeyCount(): Promise<number> {
    const [r] = await this.db.select({ c: dsql<number>`count(*)::int` }).from(apiKeys);
    return r?.c ?? 0;
  }

  async listApiKeys(): Promise<ApiKey[]> {
    const rows = await this.db.select().from(apiKeys);
    return rows.map((r) => this.toApiKey(r));
  }

  async createApiKey(name: string, scopes: ApiKeyScope[]): Promise<ApiKeyCreated> {
    const { secret, prefix, hash } = generateApiKey();
    const [row] = await this.db
      .insert(apiKeys)
      .values({ name, prefix, keyHash: hash, scopes })
      .returning();
    return { ...this.toApiKey(row), secret };
  }

  async revokeApiKey(id: string): Promise<void> {
    await this.db.delete(apiKeys).where(eq(apiKeys.id, id));
  }

  /** Verify a presented API key. Updates last-used timestamp in the background. */
  async verifyApiKey(secret: string): Promise<ApiKeyRow | null> {
    const hash = hashApiKey(secret);
    const [row] = await this.db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
    if (!row) return null;
    void this.db
      .update(apiKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiKeys.id, row.id))
      .catch((err: unknown) => logger.warn({ err }, 'failed to update api key last_used_at'));
    return row;
  }

  private toApiKey(row: ApiKeyRow): ApiKey {
    return {
      id: row.id,
      name: row.name,
      prefix: row.prefix,
      scopes: (row.scopes ?? []) as ApiKey['scopes'],
      lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
