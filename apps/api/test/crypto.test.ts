import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  generateApiKey,
  hashApiKey,
  hashPassword,
  safeEqualHex,
  verifyPassword,
} from '../src/lib/crypto';

describe('crypto', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password here', hash)).toBe(false);
  });

  it('encrypts and decrypts secrets (AES-256-GCM)', () => {
    const ciphertext = encryptSecret('super-secret-api-key');
    expect(ciphertext).not.toContain('super-secret-api-key');
    expect(ciphertext.startsWith('v1:')).toBe(true);
    expect(decryptSecret(ciphertext)).toBe('super-secret-api-key');
  });

  it('rejects tampered ciphertext', () => {
    const ciphertext = encryptSecret('value');
    const tampered = `${ciphertext.slice(0, -3)}AAA`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it('generates verifiable API keys', () => {
    const key = generateApiKey();
    expect(key.secret.startsWith('aio_live_')).toBe(true);
    expect(key.prefix).toHaveLength(16);
    expect(hashApiKey(key.secret)).toBe(key.hash);
    expect(safeEqualHex(key.hash, hashApiKey(key.secret))).toBe(true);
    expect(safeEqualHex(key.hash, hashApiKey('aio_live_other'))).toBe(false);
  });
});
