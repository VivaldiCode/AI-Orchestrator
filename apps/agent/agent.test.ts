import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { computeCpuUsage } from './agent.cjs';

const AGENT = join(dirname(fileURLToPath(import.meta.url)), 'agent.cjs');

async function waitFor(url: string, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`timeout waiting for ${url}`);
}

describe('agent CPU usage', () => {
  it('derives busy fraction from idle/total deltas', () => {
    expect(computeCpuUsage({ idle: 0, total: 0 }, { idle: 75, total: 100 })).toBeCloseTo(0.25);
    expect(computeCpuUsage({ idle: 0, total: 0 }, { idle: 0, total: 100 })).toBe(1);
  });

  it('returns 0 when there is no movement', () => {
    expect(computeCpuUsage({ idle: 100, total: 200 }, { idle: 100, total: 200 })).toBe(0);
  });

  it('clamps to 0..1', () => {
    expect(computeCpuUsage({ idle: 0, total: 0 }, { idle: -10, total: 100 })).toBeLessThanOrEqual(
      1,
    );
    expect(
      computeCpuUsage({ idle: 50, total: 0 }, { idle: 100, total: 50 }),
    ).toBeGreaterThanOrEqual(0);
  });
});

describe('agent HTTP server (spawned)', () => {
  it('serves /healthz and token-gates /stats', async () => {
    const port = 31000 + Math.floor(Math.random() * 2000);
    const token = 'test-secret';
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, [AGENT], {
      env: {
        ...process.env,
        PORT: String(port),
        HOST: '127.0.0.1',
        AGENT_TOKEN: token,
        NO_PROXY: '*',
      },
      stdio: 'ignore',
    });
    try {
      await waitFor(`${base}/healthz`);

      expect((await fetch(`${base}/healthz`)).status).toBe(200);
      expect((await fetch(`${base}/stats`)).status).toBe(401);

      const ok = await fetch(`${base}/stats`, { headers: { authorization: `Bearer ${token}` } });
      expect(ok.status).toBe(200);
      const stats = (await ok.json()) as { agent: string; cores: number };
      expect(stats.agent).toBe('ai-orchestrator-agent');
      expect(typeof stats.cores).toBe('number');
    } finally {
      child.kill();
    }
  }, 15000);
});
