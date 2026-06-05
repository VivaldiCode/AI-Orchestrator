#!/usr/bin/env node
// Smoke test for the AI Orchestrator.
// Fires concurrent chat requests and reports how the load was distributed across
// your nodes (read from the `X-Orchestrator-Node-Name` response header).
//
// Usage:
//   node scripts/smoke-test.mjs
//   ORCHESTRATOR_URL=http://localhost:11435 MODEL=llama3.2 N=20 CONCURRENCY=5 \
//     API_KEY=aio_live_xxx node scripts/smoke-test.mjs

const BASE = (process.env.ORCHESTRATOR_URL || 'http://localhost:11435').replace(/\/+$/, '');
const MODEL = process.env.MODEL || 'llama3.2';
const N = Math.max(1, Number(process.env.N || 12));
const CONCURRENCY = Math.max(1, Number(process.env.CONCURRENCY || 4));
const API_KEY = process.env.API_KEY || '';
const PROMPT = process.env.PROMPT || 'In one short sentence, say hello.';

const authHeaders = API_KEY ? { authorization: `Bearer ${API_KEY}` } : {};

const useColor = process.stdout.isTTY;
const c = (code, s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = (s) => c('32', s);
const red = (s) => c('31', s);
const dim = (s) => c('2', s);
const bold = (s) => c('1', s);

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function oneRequest() {
  const started = performance.now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        messages: [{ role: 'user', content: PROMPT }],
      }),
    });
    const latency = performance.now() - started;
    const node = res.headers.get('x-orchestrator-node-name') || 'unknown';
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, node, latency, status: res.status, error: text.slice(0, 120) };
    }
    const body = await res.json().catch(() => ({}));
    const tokens = (body.eval_count || 0) + (body.prompt_eval_count || 0);
    return { ok: true, node, latency, status: res.status, tokens };
  } catch (err) {
    return {
      ok: false,
      node: 'unreachable',
      latency: performance.now() - started,
      status: 0,
      error: String(err?.message || err),
    };
  }
}

async function runPool(total, concurrency, task) {
  const results = new Array(total);
  let next = 0;
  const worker = async () => {
    while (next < total) {
      const idx = next++;
      results[idx] = await task(idx);
      process.stdout.write(results[idx].ok ? green('.') : red('x'));
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker));
  process.stdout.write('\n');
  return results;
}

async function main() {
  console.log(bold('\n🎻 AI Orchestrator smoke test'));
  console.log(
    dim(`   target ${BASE} · model ${MODEL} · ${N} requests · concurrency ${CONCURRENCY}\n`),
  );

  try {
    const v = await getJson('/api/version');
    console.log(`orchestrator: ${v.version ?? '?'} (${v.orchestrator ?? 'ai-orchestrator'})`);
  } catch (err) {
    console.error(red(`Could not reach ${BASE}/api/version: ${err.message}`));
    process.exit(1);
  }

  try {
    const tags = await getJson('/api/tags');
    const models = (tags.models || []).map((m) => m.name);
    console.log(`models available: ${models.length ? models.join(', ') : '(none)'}`);
    const base = (s) => String(s).split(':')[0];
    if (models.length && !models.some((m) => base(m) === base(MODEL))) {
      console.log(red(`⚠ model "${MODEL}" not found on any node — pull it first.`));
    }
  } catch (err) {
    if (String(err.message).includes('401')) {
      console.log(red('⚠ /api/tags requires an API key — set API_KEY=...'));
    } else {
      console.log(dim(`(could not list models: ${err.message})`));
    }
  }

  console.log(dim('\nsending requests...'));
  const results = await runPool(N, CONCURRENCY, oneRequest);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const lat = ok.map((r) => r.latency).sort((a, b) => a - b);
  const sum = lat.reduce((a, b) => a + b, 0);
  const p95 = lat.length ? lat[Math.min(lat.length - 1, Math.floor(0.95 * lat.length))] : 0;
  const tokens = ok.reduce((a, r) => a + (r.tokens || 0), 0);

  const byNode = {};
  for (const r of results) byNode[r.node] = (byNode[r.node] || 0) + 1;

  console.log(bold('\nResults'));
  console.log(
    `  success: ${green(ok.length)} / ${N}   failed: ${failed.length ? red(failed.length) : '0'}`,
  );
  if (ok.length) {
    console.log(
      `  latency: avg ${(sum / ok.length).toFixed(0)}ms · min ${lat[0].toFixed(0)}ms · ` +
        `p95 ${p95.toFixed(0)}ms · max ${lat[lat.length - 1].toFixed(0)}ms`,
    );
    console.log(`  tokens:  ${tokens}`);
  }

  console.log(bold('\nDistribution across nodes'));
  const maxCount = Math.max(...Object.values(byNode));
  for (const [node, count] of Object.entries(byNode).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round((count / maxCount) * 24));
    const healthy = node !== 'unreachable' && node !== 'unknown';
    console.log(
      `  ${node.padEnd(20)} ${String(count).padStart(3)}  ${healthy ? green(bar) : dim(bar)}`,
    );
  }

  if (failed.length) {
    console.log(bold('\nFailures (first 3)'));
    for (const f of failed.slice(0, 3)) console.log(red(`  [${f.status}] ${f.error || ''}`));
  }

  console.log('');
  process.exit(failed.length === N ? 1 : 0);
}

main();
