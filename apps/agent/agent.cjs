#!/usr/bin/env node
// AI Orchestrator node agent — a tiny, dependency-free system-metrics bridge.
//
// Run this on each machine that hosts Ollama (macOS, Windows or Linux) so the
// dashboard can show that node's CPU and memory usage. It only reads local
// system stats (node:os) and serves them over HTTP; it never touches Ollama.
//
//   node agent.cjs                          # listens on 0.0.0.0:4127
//   PORT=4500 AGENT_TOKEN=secret node agent.cjs
//
// Or ship it as a native binary (see build.mjs / packaging/) — the binary reads
// its config from env, $AGENT_CONFIG, or `agent.config.json` next to itself.
//
// CommonJS (not ESM) so it can be embedded verbatim as a Node Single Executable
// Application, whose main script must be CommonJS.

'use strict';

const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');

const AGENT_VERSION = '0.1.0';
const SAMPLE_MS = 2000;

/** Resolve config from env, then $AGENT_CONFIG, then a file beside the binary. */
function loadConfig() {
  let fileCfg = {};
  const candidates = [];
  if (process.env.AGENT_CONFIG) candidates.push(process.env.AGENT_CONFIG);
  try {
    candidates.push(path.join(path.dirname(process.execPath), 'agent.config.json'));
  } catch {
    /* execPath unavailable */
  }
  for (const p of candidates) {
    try {
      fileCfg = JSON.parse(fs.readFileSync(p, 'utf8'));
      break;
    } catch {
      /* missing/invalid — try next */
    }
  }
  return {
    port: Number(process.env.PORT ?? fileCfg.port ?? 4127),
    host: process.env.HOST ?? fileCfg.host ?? '0.0.0.0',
    token: process.env.AGENT_TOKEN ?? fileCfg.token ?? '',
  };
}

// --- CPU usage (sampled deltas) -------------------------------------------

function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/** Fraction (0..1) of CPU time spent busy between two snapshots. */
function computeCpuUsage(prev, curr) {
  const idleDiff = curr.idle - prev.idle;
  const totalDiff = curr.total - prev.total;
  if (totalDiff <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - idleDiff / totalDiff));
}

let prevSnap = cpuSnapshot();
let cpuUsage = 0;

function collectStats() {
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  return {
    agent: 'ai-orchestrator-agent',
    version: AGENT_VERSION,
    cpu: Number(cpuUsage.toFixed(4)),
    cores: os.cpus().length,
    memTotal,
    memUsed: memTotal - memFree,
    load1: os.loadavg()[0] ?? null,
    platform: os.platform(),
    arch: os.arch(),
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    at: new Date().toISOString(),
  };
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify(body));
}

function startServer(config = loadConfig()) {
  const sampler = setInterval(() => {
    const curr = cpuSnapshot();
    cpuUsage = computeCpuUsage(prevSnap, curr);
    prevSnap = curr;
  }, SAMPLE_MS);
  if (typeof sampler.unref === 'function') sampler.unref();

  const server = createServer((req, res) => {
    const reqPath = (req.url || '').split('?')[0];
    if (reqPath === '/healthz') return send(res, 200, { status: 'ok', version: AGENT_VERSION });
    if (reqPath === '/stats') {
      if (config.token && req.headers['authorization'] !== `Bearer ${config.token}`) {
        return send(res, 401, { error: 'unauthorized' });
      }
      return send(res, 200, collectStats());
    }
    send(res, 404, { error: 'not_found' });
  });

  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(
      `ai-orchestrator-agent v${AGENT_VERSION} listening on ${config.host}:${config.port}` +
        (config.token ? ' (token required)' : ''),
    );
  });
  return server;
}

module.exports = {
  AGENT_VERSION,
  cpuSnapshot,
  computeCpuUsage,
  collectStats,
  loadConfig,
  startServer,
};

/** True when running as a Node Single Executable Application. */
function isSea() {
  try {
    return require('node:sea').isSea();
  } catch {
    return false;
  }
}

// Start the server when executed directly or embedded as a SEA — but not when
// imported by tests.
if (require.main === module || isSea()) startServer();
