#!/usr/bin/env node
// Build a single-file native binary of the node agent using Node SEA
// (Single Executable Applications). Produces `build/ai-orchestrator-agent-<os>-<arch>`
// for the CURRENT platform — cross-OS binaries are built by the per-OS CI matrix
// (see .github/workflows/release-agents.yml).
//
//   node build.mjs
//
// Requires network access once to fetch `postject` (the official Node SEA
// injector) via npx; nothing is added to the project's dependencies.
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arch, platform } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const buildDir = join(here, 'build');
const POSTJECT = 'postject@1.0.0-alpha.6';
// Standard SEA sentinel fuse (see Node.js single-executable-applications docs).
const FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

const isWin = platform() === 'win32';
const isMac = platform() === 'darwin';
const binName = `ai-orchestrator-agent-${platform()}-${arch()}${isWin ? '.exe' : ''}`;
const binPath = join(buildDir, binName);
const blobPath = join(buildDir, 'agent.blob');

function run(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  execFileSync(cmd, args, { stdio: 'inherit', cwd: here, ...opts });
}

rmSync(buildDir, { recursive: true, force: true });
mkdirSync(buildDir, { recursive: true });

// 1) Build the SEA blob from sea-config.json.
run(process.execPath, ['--experimental-sea-config', 'sea-config.json']);

// 2) Copy the running Node binary as the base executable.
copyFileSync(process.execPath, binPath);
if (!isWin) chmodSync(binPath, 0o755);

// 3) macOS: strip the existing signature before injecting.
if (isMac) {
  try {
    run('codesign', ['--remove-signature', binPath]);
  } catch {
    /* binary may be unsigned in some environments */
  }
}

// 4) Inject the blob with postject (fetched ephemerally via npx).
const postjectArgs = [
  '--yes',
  POSTJECT,
  binPath,
  'NODE_SEA_BLOB',
  blobPath,
  '--sentinel-fuse',
  FUSE,
];
if (isMac) postjectArgs.push('--macho-segment-name', 'NODE_SEA');
run(isWin ? 'npx.cmd' : 'npx', postjectArgs);

// 5) macOS: re-sign ad-hoc so Gatekeeper will run it locally (CI re-signs with a
//    real Developer ID + notarizes — see the release workflow).
if (isMac) run('codesign', ['--sign', '-', '--force', binPath]);

console.log(`\n✓ Built ${binPath}`);
