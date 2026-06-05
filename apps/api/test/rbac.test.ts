import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  createUserSchema,
  effectivePermissions,
  updateUserSchema,
  type Permission,
} from '@ai-orchestrator/shared';

describe('RBAC permission model', () => {
  it('grants admins every known permission', () => {
    expect([...ROLE_PERMISSIONS.admin].sort()).toEqual([...PERMISSIONS].sort());
  });

  it('nests viewer ⊂ editor ⊂ admin', () => {
    const isSubset = (a: Permission[], b: Permission[]) => a.every((p) => b.includes(p));
    expect(isSubset(ROLE_PERMISSIONS.viewer, ROLE_PERMISSIONS.editor)).toBe(true);
    expect(isSubset(ROLE_PERMISSIONS.editor, ROLE_PERMISSIONS.admin)).toBe(true);
  });

  it('keeps user management admin-only', () => {
    expect(ROLE_PERMISSIONS.viewer).not.toContain('users:write');
    expect(ROLE_PERMISSIONS.editor).not.toContain('users:write');
    expect(ROLE_PERMISSIONS.admin).toContain('users:write');
  });

  it('grants viewers read but never write', () => {
    for (const p of ROLE_PERMISSIONS.viewer) expect(p.endsWith(':read')).toBe(true);
  });

  describe('effectivePermissions', () => {
    it('falls back to role defaults without an override', () => {
      expect(effectivePermissions('viewer')).toEqual(ROLE_PERMISSIONS.viewer);
      expect(effectivePermissions('editor', null)).toEqual(ROLE_PERMISSIONS.editor);
      expect(effectivePermissions('viewer', [])).toEqual(ROLE_PERMISSIONS.viewer);
    });

    it('honours an explicit override', () => {
      expect(effectivePermissions('viewer', ['nodes:write'])).toEqual(['nodes:write']);
    });
  });

  describe('schemas', () => {
    it('defaults new users to a full-permission admin', () => {
      const parsed = createUserSchema.parse({ username: 'alice', password: 'a-strong-pass!!' });
      expect(parsed.role).toBe('admin');
      expect(parsed.permissions).toBeNull();
    });

    it('rejects short passwords', () => {
      expect(createUserSchema.safeParse({ username: 'bob', password: 'short' }).success).toBe(false);
    });

    it('accepts an empty partial update', () => {
      expect(updateUserSchema.parse({})).toEqual({});
    });

    it('rejects unknown permissions in an update', () => {
      expect(updateUserSchema.safeParse({ permissions: ['bogus:perm'] }).success).toBe(false);
    });
  });
});
