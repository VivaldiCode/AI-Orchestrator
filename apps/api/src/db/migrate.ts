import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { config } from '../config/index';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(here, 'migrations');

/**
 * Split a SQL script into statements, respecting single-quoted strings and
 * `$$` dollar-quoting, and stripping `-- ` line comments. Sufficient for our
 * hand-written migrations (which may contain DO blocks and functions).
 */
export function splitStatements(sqlText: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inSingle = false;
  let dollarTag: string | null = null;

  for (let i = 0; i < sqlText.length; i++) {
    const ch = sqlText[i];

    if (!inSingle && !dollarTag && ch === '-' && sqlText[i + 1] === '-') {
      const nl = sqlText.indexOf('\n', i);
      i = nl === -1 ? sqlText.length : nl;
      continue;
    }

    if (!inSingle) {
      const m = /^\$[A-Za-z0-9_]*\$/.exec(sqlText.slice(i));
      if (m) {
        const tag = m[0];
        dollarTag = dollarTag === null ? tag : dollarTag === tag ? null : dollarTag;
        current += tag;
        i += tag.length - 1;
        continue;
      }
    }

    if (!dollarTag && ch === "'") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }

    if (ch === ';' && !inSingle && !dollarTag) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

export async function runMigrations(databaseUrl = config.databaseUrl): Promise<string[]> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  const appliedNow: string[] = [];
  try {
    await sql`CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`;

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const rows = await sql<{ name: string }[]>`SELECT name FROM _migrations`;
    const applied = new Set(rows.map((r) => r.name));

    for (const file of files) {
      if (applied.has(file)) continue;
      const content = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      const statements = splitStatements(content);
      await sql.begin(async (tx) => {
        for (const stmt of statements) {
          await tx.unsafe(stmt);
        }
        await tx`INSERT INTO _migrations (name) VALUES (${file})`;
      });
      appliedNow.push(file);
    }
    return appliedNow;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// Allow running directly: `tsx src/db/migrate.ts`
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  runMigrations()
    .then((applied) => {
      if (applied.length === 0) {
        console.log('Database is up to date — no migrations to apply.');
      } else {
        console.log(`Applied ${applied.length} migration(s):\n  ${applied.join('\n  ')}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
