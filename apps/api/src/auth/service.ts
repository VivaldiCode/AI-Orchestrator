import { eq, sql as dsql } from 'drizzle-orm';
import { effectivePermissions } from '@ai-orchestrator/shared';
import type {
  ApiKey,
  ApiKeyCreated,
  ApiKeyScope,
  CreateUserInput,
  Permission,
  Role,
  UpdateUserInput,
  User,
} from '@ai-orchestrator/shared';
import type { DB } from '../db/client';
import { apiKeys, users, type ApiKeyRow, type UserRow } from '../db/schema';
import { conflict, notFound, unauthorized } from '../lib/errors';
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
    const role = row.role as Role;
    return {
      id: row.id,
      username: row.username,
      role,
      permissions: effectivePermissions(role, row.permissions as Permission[] | null),
      createdAt: row.createdAt.toISOString(),
    };
  }

  // --- users (dashboard accounts) ------------------------------------------

  async listUsers(): Promise<User[]> {
    const rows = await this.db.select().from(users).orderBy(users.createdAt);
    return rows.map((r) => this.toUser(r));
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);
    if (existing.length > 0) throw conflict('A user with that username already exists.');
    const passwordHash = await hashPassword(input.password);
    const [row] = await this.db
      .insert(users)
      .values({
        username: input.username,
        passwordHash,
        role: input.role,
        permissions: input.permissions,
      })
      .returning();
    return this.toUser(row);
  }

  async updateUser(id: string, patch: UpdateUserInput): Promise<User> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw notFound('User not found.');
    // Never strip the last remaining admin of their admin role.
    if (current.role === 'admin' && patch.role && patch.role !== 'admin') {
      if ((await this.countAdmins()) <= 1) throw conflict('Cannot demote the last admin.');
    }
    const values: Partial<typeof users.$inferInsert> = {};
    if (patch.role !== undefined) values.role = patch.role;
    if (patch.permissions !== undefined) values.permissions = patch.permissions;
    if (patch.password !== undefined) values.passwordHash = await hashPassword(patch.password);
    if (Object.keys(values).length === 0) return this.toUser(current);
    const [row] = await this.db.update(users).set(values).where(eq(users.id, id)).returning();
    return this.toUser(row);
  }

  async deleteUser(id: string): Promise<void> {
    const [current] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!current) throw notFound('User not found.');
    if (current.role === 'admin' && (await this.countAdmins()) <= 1) {
      throw conflict('Cannot delete the last admin.');
    }
    await this.db.delete(users).where(eq(users.id, id));
  }

  async countAdmins(): Promise<number> {
    const [r] = await this.db
      .select({ c: dsql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, 'admin'));
    return r?.c ?? 0;
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
