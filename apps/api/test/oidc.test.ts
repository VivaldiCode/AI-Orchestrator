import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type JWK } from 'jose';
import { createOAuthProviderSchema } from '@ai-orchestrator/shared';
import { generatePkce, openState, sealState, verifyIdToken } from '../src/lib/oidc';
import { createHash } from 'node:crypto';

const ISS = 'https://idp.test';
const AUD = 'client-123';
const KID = 'test-key-1';

let server: Server;
let jwksUri: string;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

async function sign(
  payload: Record<string, unknown>,
  opts: { iss?: string; aud?: string; exp?: string | number } = {},
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? AUD)
    .setExpirationTime(opts.exp ?? '5m')
    .sign(privateKey);
}

beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk: JWK = { ...(await exportJWK(pair.publicKey)), kid: KID, alg: 'RS256', use: 'sig' };
  server = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  jwksUri = `http://127.0.0.1:${port}/jwks`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('verifyIdToken', () => {
  const base = { jwksUri: '', issuer: ISS, audience: AUD };
  const opts = () => ({ ...base, jwksUri });

  it('accepts a valid, correctly-signed id_token', async () => {
    const token = await sign({ sub: 'user-1', email: 'a@acme.com', nonce: 'n1' });
    const claims = await verifyIdToken(token, { ...opts(), nonce: 'n1' });
    expect(claims.sub).toBe('user-1');
    expect(claims.email).toBe('a@acme.com');
  });

  it('rejects a tampered signature', async () => {
    const token = await sign({ sub: 'user-1', nonce: 'n1' });
    const tampered = token.slice(0, -3) + (token.endsWith('AAA') ? 'BBB' : 'AAA');
    await expect(verifyIdToken(tampered, { ...opts(), nonce: 'n1' })).rejects.toThrow();
  });

  it('rejects a wrong audience', async () => {
    const token = await sign({ sub: 'user-1' }, { aud: 'someone-else' });
    await expect(verifyIdToken(token, opts())).rejects.toThrow();
  });

  it('rejects a wrong issuer', async () => {
    const token = await sign({ sub: 'user-1' }, { iss: 'https://evil.test' });
    await expect(verifyIdToken(token, opts())).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ sub: 'user-1' }, { exp: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyIdToken(token, opts())).rejects.toThrow();
  });

  it('rejects a nonce mismatch', async () => {
    const token = await sign({ sub: 'user-1', nonce: 'n1' });
    await expect(verifyIdToken(token, { ...opts(), nonce: 'n2' })).rejects.toThrow();
  });
});

describe('PKCE', () => {
  it('derives the S256 challenge from the verifier', () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });
});

describe('sealed handshake state', () => {
  const data = { providerId: 'p1', state: 's1', verifier: 'v1', nonce: 'n1', returnTo: '/' };

  it('round-trips through seal/open', () => {
    expect(openState(sealState(data))).toEqual(data);
  });

  it('returns null for tampered or malformed input', () => {
    const sealed = sealState(data);
    expect(openState(sealed.slice(0, -4) + 'zzzz')).toBeNull();
    expect(openState('not-a-sealed-value')).toBeNull();
  });
});

describe('createOAuthProviderSchema', () => {
  it('applies sensible defaults', () => {
    const p = createOAuthProviderSchema.parse({
      type: 'google',
      displayName: 'Acme Google',
      issuer: 'https://accounts.google.com',
      clientId: 'abc',
      clientSecret: 'shh',
    });
    expect(p.scopes).toEqual(['openid', 'email', 'profile']);
    expect(p.enabled).toBe(true);
    expect(p.allowedDomains).toEqual([]);
    expect(p.defaultRole).toBe('viewer');
  });

  it('rejects a non-URL issuer', () => {
    const r = createOAuthProviderSchema.safeParse({
      type: 'oidc',
      displayName: 'x',
      issuer: 'not a url',
      clientId: 'abc',
      clientSecret: 'shh',
    });
    expect(r.success).toBe(false);
  });
});
