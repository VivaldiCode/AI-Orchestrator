import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHash,
  randomUUID,
  type ScryptOptions,
} from 'node:crypto';
import { config } from '../config/index';

// scrypt parameters. 128 * N * r * p = ~16 MB, within Node's default maxmem.
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 } as const;

/** Promise wrapper for scrypt that supports the options object. */
function scrypt(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/** Hash a password with scrypt. Output encodes parameters + salt for verification. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, SCRYPT.keylen, {
    N: SCRYPT.N,
    r: SCRYPT.r,
    p: SCRYPT.p,
  })) as Buffer;
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/** Verify a password against a stored scrypt hash in constant time. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;
  const derived = (await scrypt(password, salt, expected.length, { N, r, p })) as Buffer;
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// --- Secret encryption at rest (AES-256-GCM) -------------------------------

function deriveKey(): Buffer {
  const raw = config.masterKey;
  // Prefer a base64-encoded 32-byte key; otherwise derive 32 bytes via SHA-256.
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length === 32) return decoded;
  return createHash('sha256').update(raw, 'utf8').digest();
}

const KEY = deriveKey();

/** Encrypt a secret for storage. Returns `v1:iv:tag:ciphertext` (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

/** Decrypt a secret produced by {@link encryptSecret}. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid ciphertext format');
  const iv = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const ct = Buffer.from(parts[3], 'base64');
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// --- API keys --------------------------------------------------------------

export interface GeneratedApiKey {
  secret: string;
  prefix: string;
  hash: string;
}

/**
 * Generate an API key. The secret has full 256-bit entropy, so a fast SHA-256
 * hash is appropriate for per-request verification (a slow KDF is unnecessary
 * and would add latency to every inference call).
 */
export function generateApiKey(): GeneratedApiKey {
  const secret = `aio_live_${randomBytes(32).toString('base64url')}`;
  return { secret, prefix: secret.slice(0, 16), hash: hashApiKey(secret) };
}

export function hashApiKey(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time comparison of two hex-encoded digests. */
export function safeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  return ab.length === bb.length && ab.length > 0 && timingSafeEqual(ab, bb);
}

export { randomUUID };
