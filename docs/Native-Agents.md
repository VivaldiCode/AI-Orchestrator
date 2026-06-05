# Native Agents (.deb / .exe / .app)

> **Status: implemented.** The [node agent](Node-Agent.md) ships as a self-contained native binary
> per OS — **no Node install required**. It's the same dependency-free agent
> (`apps/agent/agent.cjs`), baked into the Node runtime via **SEA** (Single Executable Application)
> and packaged as a Debian `.deb`, a macOS `.app`/`.pkg`, and a Windows `.zip` (exe + startup task).
> Cross-OS binaries are built by CI; the macOS path is verified locally.

## Why

> **The agent is optional** — it only feeds per-node **CPU/memory** to the dashboard
> ([Node Agent](Node-Agent.md)). The orchestrator load-balances and routes without it. Install it
> only on machines where you want those stats.

Adding a node otherwise means: install Node, copy the script, run it, keep it running. A native
agent collapses that to **download → install → set port/token**. Same telemetry, friendlier on-ramp.

## Build & install

Build the binary for your current OS (fetches `postject` once via npx; nothing is added to the
project's dependencies), then package it:

```bash
cd apps/agent
node build.mjs                 # → build/ai-orchestrator-agent-<os>-<arch>
bash packaging/deb.sh          # Linux  → build/ai-orchestrator-agent_<v>_<arch>.deb
bash packaging/macos-app.sh    # macOS  → build/AI Orchestrator Agent.app (+ .pkg)
pwsh packaging/windows.ps1     # Windows → build/ai-orchestrator-agent-<v>-win-<arch>.zip
```

Each package installs the binary as a background service that starts on boot — **systemd** (Linux),
**launchd** (macOS), a **Scheduled Task** (Windows) — and reads its config (`port`, `host`, `token`)
from `agent.config.json` next to the binary (or `$AGENT_CONFIG`, or env vars). Then register the
node in the dashboard and set its **Agent port**.

Releases attach prebuilt, checksummed artifacts for all three OSes (see the
`release-agents` workflow), so most operators just download and install.

## Targets

| OS      | Artifact          | Mechanism                                                                 |
| ------- | ----------------- | ------------------------------------------------------------------------- |
| Windows | `.exe` (zip)      | Node **SEA** exe + a **Scheduled Task** (works without a service wrapper) |
| macOS   | `.app` (+ `.pkg`) | SEA inside an `.app` bundle; `launchd` LaunchAgent                        |
| Linux   | `.deb`            | SEA binary + **systemd** unit (Debian/Ubuntu family)                      |

> Linux is **Debian-based (`.deb`) only** for the first release, per project scope. RPM/others can
> follow if there's demand.

## Build approach — Node SEA

Node 24 ships [Single Executable Applications](https://nodejs.org/api/single-executable.html): bake
`agent.cjs` (CommonJS — SEA mains must be CJS) into the Node runtime to get one self-contained
binary — **no system Node required**, consistent with our zero-runtime-dependency stance
([Security](Security.md)). `apps/agent/build.mjs` automates blob creation, injection (via the
official `postject`, fetched ephemerally) and macOS signing.

```
node --experimental-sea-config sea-config.json   # blob
# inject blob into a copy of the node binary (postject), then sign per-OS
```

Per-OS wrapping:

- **Windows:** ship the exe + a Scheduled Task (`install.ps1`) that runs it at startup as SYSTEM;
  an Inno Setup/MSIX installer + Authenticode signing are wired in CI when a cert is provided.
- **macOS:** place the binary in `Agent.app/Contents/MacOS`, ship a `launchd` plist, **codesign +
  notarize** (required by Gatekeeper).
- **Linux:** `.deb` with the binary in `/usr/lib/ai-orchestrator-agent/`, a `systemd` service, and
  `postinst` to enable it.

## Configuration

The agent is **passive** — the orchestrator polls it — so it only needs:

- **Port** (default `4127`) and **host** to bind.
- An optional **token**; when set, `/stats` requires `Authorization: Bearer <token>`. Put the same
  value in the orchestrator's `NODE_AGENT_TOKEN` (see [Node Agent](Node-Agent.md)).

Resolved (in order) from env vars, `$AGENT_CONFIG`, or an `agent.config.json` next to the binary —
the packages install a default one you can edit. Then register the node and set its **Agent port**
in the dashboard.

## Security

- **Signed everything:** Authenticode (Windows), codesign+notarize (macOS), signed `.deb` + GPG
  `Release` (Linux). Publish **SHA-256 checksums** with each release.
- Least privilege: the agent only reads CPU/memory/load and serves them on the agent port — no
  inference, no node mutation.
- Token-protected endpoint by default in the installers.
- Reproducible builds in CI; artifacts attested via build provenance.

## CI / release pipeline

A `release-agents` GitHub Actions workflow, triggered on tags:

```
matrix: [windows-latest, macos-latest, ubuntu-latest]
  ├─ build SEA binary for the OS/arch (x64 + arm64)
  ├─ wrap (.exe / .app+.pkg / .deb)
  ├─ sign + (macOS) notarize
  ├─ checksum
  └─ upload to the GitHub Release
```

Secrets (signing certs, notarization keys) live in repo/org **Actions secrets**, never in the tree.

## Auto-update (later)

Optional, opt-in: check the GitHub Releases API for a newer signed build and self-replace. Off by
default; operators can also just reinstall.

## Rollout

1. SEA build script + `.deb` (simplest signing story) and the CI matrix skeleton.
2. macOS `.app`/`.pkg` with codesign + notarization.
3. Windows `.exe` + service + Authenticode.
4. Checksums/provenance on releases, then optional auto-update.

See also: [Node Agent](Node-Agent.md) · [Security](Security.md) · [Roadmap](Roadmap.md).
