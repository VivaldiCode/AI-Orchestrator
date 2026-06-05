// A dependency-free fake OIDC identity provider for end-to-end SSO testing.
// Implements discovery, JWKS, /authorize (auto-approves) and /token (returns a
// real RS256-signed id_token). For docker-compose.test only — never for prod.
import { createServer } from 'node:http';
import { generateKeyPairSync, randomBytes, sign as cryptoSign } from 'node:crypto';

const PORT = Number(process.env.PORT || 9000);
const ISSUER = process.env.ISSUER || `http://localhost:${PORT}`;
const SUBJECT = process.env.SUBJECT || 'mock-user-1';
const EMAIL = process.env.EMAIL || 'alice@acme.com';
const KID = 'mock-oidc-key';

const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const codes = new Map(); // code -> { nonce, aud }

function signJwt(claims) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: KID }));
  const payload = b64url(JSON.stringify(claims));
  const data = `${header}.${payload}`;
  const sig = cryptoSign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url');
  return `${data}.${sig}`;
}

const server = createServer((req, res) => {
  const url = new URL(req.url || '/', ISSUER);
  const json = (obj) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(obj));
  };

  if (url.pathname === '/.well-known/openid-configuration') {
    return json({
      issuer: ISSUER,
      authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`,
      jwks_uri: `${ISSUER}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    });
  }

  if (url.pathname === '/jwks') return json({ keys: [jwk] });

  if (url.pathname === '/authorize') {
    const redirectUri = url.searchParams.get('redirect_uri');
    const state = url.searchParams.get('state') || '';
    const nonce = url.searchParams.get('nonce') || '';
    const aud = url.searchParams.get('client_id') || '';
    if (!redirectUri) {
      res.statusCode = 400;
      return res.end('missing redirect_uri');
    }
    const code = randomBytes(16).toString('hex');
    codes.set(code, { nonce, aud });
    const loc = new URL(redirectUri);
    loc.searchParams.set('code', code);
    loc.searchParams.set('state', state);
    res.statusCode = 302;
    res.setHeader('location', loc.toString());
    return res.end();
  }

  if (url.pathname === '/token' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const entry = codes.get(body.get('code') || '');
      codes.delete(body.get('code') || '');
      if (!entry) {
        res.statusCode = 400;
        return json({ error: 'invalid_grant' });
      }
      const now = Math.floor(Date.now() / 1000);
      const idToken = signJwt({
        iss: ISSUER,
        aud: entry.aud || body.get('client_id'),
        sub: SUBJECT,
        email: EMAIL,
        email_verified: true,
        name: 'Alice Example',
        nonce: entry.nonce,
        iat: now,
        exp: now + 300,
      });
      return json({
        id_token: idToken,
        access_token: 'mock-access-token',
        token_type: 'Bearer',
        expires_in: 300,
      });
    });
    return;
  }

  res.statusCode = 404;
  res.end('not found');
});

server.listen(PORT, () => console.log(`mock-oidc listening on ${PORT} (issuer: ${ISSUER})`));
