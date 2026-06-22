/**
 * Branded, self-contained HTML page rendered when the browser-facing OIDC
 * handshake (`/start`, `/callback`) fails — friendlier than raw JSON. No
 * external assets, no inline scripts (CSP-safe), dark theme matching the
 * dashboard.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A short, human title for common SSO failure status codes. */
function titleFor(status: number): string {
  if (status === 403) return 'Access denied';
  if (status === 401) return 'Could not verify sign-in';
  if (status === 502 || status === 503) return 'Identity provider unreachable';
  if (status >= 400 && status < 500) return 'Sign-in could not be completed';
  return 'Something went wrong';
}

export function oauthErrorPage(opts: { status: number; message: string; loginUrl: string }): string {
  const title = escapeHtml(titleFor(opts.status));
  const message = escapeHtml(opts.message);
  const loginUrl = escapeHtml(opts.loginUrl);
  const status = opts.status;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Sign-in failed · AI Orchestrator</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    padding: 24px;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #e2e8f0;
    background: radial-gradient(1200px 600px at 50% -10%, #1e1b4b 0%, #020617 55%) no-repeat, #020617;
  }
  .card {
    width: 100%; max-width: 460px; background: #0f172a;
    border: 1px solid #1e293b; border-radius: 16px;
    box-shadow: 0 24px 60px -20px rgba(0,0,0,.7);
    padding: 32px; text-align: center;
  }
  .badge {
    width: 56px; height: 56px; margin: 0 auto 18px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center; font-size: 28px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    box-shadow: 0 8px 24px -6px rgba(124,58,237,.6);
  }
  .brand { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #818cf8; font-weight: 600; }
  h1 { margin: 6px 0 14px; font-size: 22px; font-weight: 700; color: #f8fafc; }
  .msg {
    margin: 0 0 20px; padding: 14px 16px; border-radius: 10px;
    background: rgba(244,63,94,.08); border: 1px solid rgba(244,63,94,.28);
    color: #fecdd3; font-size: 14px; line-height: 1.55; word-break: break-word;
  }
  .pill {
    display: inline-block; margin-bottom: 22px; padding: 3px 10px; border-radius: 999px;
    font-size: 12px; color: #94a3b8; background: #1e293b; border: 1px solid #334155;
  }
  .btn {
    display: inline-block; width: 100%; padding: 12px 16px; border-radius: 10px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff;
    text-decoration: none; font-weight: 600; font-size: 15px;
    transition: filter .15s ease;
  }
  .btn:hover { filter: brightness(1.08); }
  .hint { margin: 16px 0 0; font-size: 12px; color: #64748b; line-height: 1.5; }
</style>
</head>
<body>
  <main class="card">
    <div class="badge" aria-hidden="true">🎻</div>
    <div class="brand">AI Orchestrator</div>
    <h1>${title}</h1>
    <p class="msg">${message}</p>
    <div class="pill">SSO error · ${status}</div>
    <a class="btn" href="${loginUrl}">Back to sign in</a>
    <p class="hint">If this keeps happening, contact your administrator with the message above.</p>
  </main>
</body>
</html>`;
}
