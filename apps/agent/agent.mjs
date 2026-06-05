#!/usr/bin/env node
// AI Orchestrator node agent — a tiny, dependency-free system-metrics bridge.
//
// Run this on each machine that hosts Ollama (macOS, Windows or Linux) so the
// dashboard can show that node's CPU and memory usage. It only reads local
// system stats (node:os) and serves them over HTTP; it never touches Ollama.
//
//   node agent.mjs                          # listens on 0.0.0.0:4127
//   PORT=4500 AGENT_TOKEN=secret node agent.mjs
//
// Then register the node in the dashboard and set its "Agent port".

import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

export const AGENT_VERSION = '0.1.0';

const PORT = Number(process.env.PORT || 4127);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.AGENT_TOKEN || '';
const SAMPLE_MS = 2000;

// --- CPU usage (sampled deltas) -------------------------------------------

export function cpuSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const value of Object.values(cpu.times)) total += value;
    idle += cpu.times.idle;
  }
  return { idle, total };
}

/** Fraction (0..1) of CPU time spent busy between two snapshots. */
export function computeCpuUsage(prev, curr) {
  const idleDiff = curr.idle - prev.idle;
  const totalDiff = curr.total - prev.total;
  if (totalDiff <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - idleDiff / totalDiff));
}

let prevSnap = cpuSnapshot();
let cpuUsage = 0;

export function collectStats() {
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

export function startServer() {
  const sampler = setInterval(() => {
    const curr = cpuSnapshot();
    cpuUsage = computeCpuUsage(prevSnap, curr);
    prevSnap = curr;
  }, SAMPLE_MS);
  if (typeof sampler.unref === 'function') sampler.unref();

  const server = createServer((req, res) => {
    const path = (req.url || '').split('?')[0];
    if (path === '/healthz') return send(res, 200, { status: 'ok', version: AGENT_VERSION });
    if (path === '/stats') {
      if (TOKEN && req.headers['authorization'] !== `Bearer ${TOKEN}`) {
        return send(res, 401, { error: 'unauthorized' });
      }
      return send(res, 200, collectStats());
    }
    send(res, 404, { error: 'not_found' });
  });

  server.listen(PORT, HOST, () => {
    // eslint-disable-next-line no-console
    console.log(
      `ai-orchestrator-agent v${AGENT_VERSION} listening on ${HOST}:${PORT}` +
        (TOKEN ? ' (token required)' : ''),
    );
  });
  return server;
}

// Start only when run directly (not when imported by tests).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) startServer();
