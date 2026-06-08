import { appendFile, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ArchiveEntry } from '@ai-orchestrator/shared';
import { logger } from '../lib/logger';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9_.-]+$/; // request ids are req_<base64url>; no slashes/..

export interface ArchiveInput {
  id: string;
  at: string;
  method: string;
  endpoint: string;
  model: string | null;
  provider: string;
  nodeId: string | null;
  nodeName: string | null;
  clientIp: string | null;
  clientKeyId: string | null;
  status: number;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
  requestHeaders: Record<string, string>;
}

/** Snapshot inbound headers for the archive, dropping secrets. */
export function sanitizeHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k === 'authorization' || k === 'cookie' || k === 'set-cookie') continue;
    if (v == null) continue;
    out[k] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

function toBuf(body: Buffer | string | null | undefined): Buffer {
  if (body == null) return Buffer.alloc(0);
  return Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
}

function cap(buf: Buffer, max: number): { data: Buffer; truncated: boolean } {
  if (max > 0 && buf.length > max) return { data: buf.subarray(0, max), truncated: true };
  return { data: buf, truncated: false };
}

/**
 * Persists a complete, on-disk history of every proxied request: one metadata
 * record plus the raw request body (the prompt) and the raw response body, under
 * `<dir>/<YYYY-MM-DD>/`. Best-effort — archiving must never break the request
 * path, so all failures are swallowed (logged). Disabled unless configured.
 */
export class RequestArchive {
  readonly enabled: boolean;
  readonly maxBytes: number;
  private readonly dir: string;
  private readonly retentionDays: number;

  constructor(opts: { enabled: boolean; dir: string; maxBytes: number; retentionDays: number }) {
    this.enabled = opts.enabled;
    this.dir = opts.dir;
    this.maxBytes = opts.maxBytes;
    this.retentionDays = opts.retentionDays;
  }

  /** Write one exchange (meta + request body + response body). Never throws. */
  async record(
    input: ArchiveInput,
    requestBody: Buffer | string | null,
    responseBody: Buffer | string | null,
  ): Promise<void> {
    if (!this.enabled) return;
    try {
      const date = input.at.slice(0, 10);
      const dayDir = join(this.dir, date);
      await mkdir(dayDir, { recursive: true });

      const reqBuf = toBuf(requestBody);
      const resBuf = toBuf(responseBody);
      const req = cap(reqBuf, this.maxBytes);
      const res = cap(resBuf, this.maxBytes);
      await writeFile(join(dayDir, `${input.id}.request`), req.data);
      await writeFile(join(dayDir, `${input.id}.response`), res.data);

      const entry: ArchiveEntry = {
        ...input,
        requestBytes: reqBuf.length,
        responseBytes: resBuf.length,
        requestTruncated: req.truncated,
        responseTruncated: res.truncated,
      };
      await writeFile(join(dayDir, `${input.id}.json`), JSON.stringify(entry, null, 2));
      await appendFile(join(dayDir, 'index.jsonl'), JSON.stringify(entry) + '\n');
    } catch (err) {
      logger.warn({ err }, 'failed to archive request');
    }
  }

  /** Available archive days (YYYY-MM-DD), newest first. */
  async listDates(): Promise<string[]> {
    try {
      const entries = await readdir(this.dir, { withFileTypes: true });
      return entries
        .filter((e) => e.isDirectory() && DATE_RE.test(e.name))
        .map((e) => e.name)
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /** A page of entries for a day (defaults to the most recent day), newest first. */
  async list(opts: {
    date?: string;
    limit: number;
    offset: number;
  }): Promise<{ date: string; total: number; items: ArchiveEntry[] }> {
    const date = opts.date ?? (await this.listDates())[0];
    if (!date || !DATE_RE.test(date)) return { date: date ?? '', total: 0, items: [] };
    let txt: string;
    try {
      txt = await readFile(join(this.dir, date, 'index.jsonl'), 'utf8');
    } catch {
      return { date, total: 0, items: [] };
    }
    const lines = txt.split('\n').filter(Boolean);
    const all: ArchiveEntry[] = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        all.push(JSON.parse(lines[i]) as ArchiveEntry);
      } catch {
        /* skip malformed line */
      }
    }
    return { date, total: all.length, items: all.slice(opts.offset, opts.offset + opts.limit) };
  }

  async readMeta(date: string, id: string): Promise<ArchiveEntry | null> {
    if (!DATE_RE.test(date) || !ID_RE.test(id)) return null;
    try {
      return JSON.parse(await readFile(join(this.dir, date, `${id}.json`), 'utf8')) as ArchiveEntry;
    } catch {
      return null;
    }
  }

  async readBody(date: string, id: string, kind: 'request' | 'response'): Promise<Buffer | null> {
    if (!DATE_RE.test(date) || !ID_RE.test(id)) return null;
    try {
      return await readFile(join(this.dir, date, `${id}.${kind}`));
    } catch {
      return null;
    }
  }

  /** Delete archive day-folders older than the retention window (no-op if 0). */
  async prune(now: Date = new Date()): Promise<void> {
    if (!this.enabled || this.retentionDays <= 0) return;
    const cutoff = new Date(now.getTime() - this.retentionDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    try {
      for (const date of await this.listDates()) {
        if (date < cutoff) {
          await rm(join(this.dir, date), { recursive: true, force: true });
          logger.info({ date }, 'pruned archive day past retention');
        }
      }
    } catch (err) {
      logger.warn({ err }, 'archive prune failed');
    }
  }
}
