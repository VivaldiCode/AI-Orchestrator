# Native Agents (.deb / .exe / .app) — Plan

> **Status: planned.** The [node agent](Node-Agent.md) already exists today as a dependency-free
> script (`apps/agent/agent.mjs`) you run with Node. This page describes packaging it as **native,
> double-clickable installers** per OS so non-technical operators can add a Mac/PC/Linux box without
> touching a terminal. Design contract; not shipped yet.

## Why

Adding a node currently means: install Node, copy the script, run it, open a port. A native agent
collapses that to **download → install → enter the orchestrator URL**. Same telemetry, friendlier
on-ramp.

## Targets

| OS      | Artifact          | Mechanism                                                   |
| ------- | ----------------- | ----------------------------------------------------------- |
| Windows | `.exe` installer  | Node **SEA** (Single Executable App) + service via `sc.exe` |
| macOS   | `.app` (+ `.pkg`) | SEA inside an `.app` bundle; `launchd` LaunchAgent          |
| Linux   | `.deb`            | SEA binary + **systemd** unit (Debian/Ubuntu family)        |

> Linux is **Debian-based (`.deb`) only** for the first release, per project scope. RPM/others can
> follow if there's demand.

## Build approach — Node SEA

Node 24 ships [Single Executable Applications](https://nodejs.org/api/single-executable.html): bake
`agent.mjs` into the Node runtime to get one self-contained binary — **no system Node required**,
consistent with our zero-runtime-dependency stance ([Security](Security.md)).

```
node --experimental-sea-config sea-config.json   # blob
# inject blob into a copy of the node binary (postject), then sign per-OS
```

Per-OS wrapping:

- **Windows:** wrap the binary in an installer (e.g. Inno Setup/MSIX), register a Windows Service,
  sign with an Authenticode cert.
- **macOS:** place the binary in `Agent.app/Contents/MacOS`, ship a `launchd` plist, **codesign +
  notarize** (required by Gatekeeper).
- **Linux:** `.deb` with the binary in `/usr/lib/ai-orchestrator-agent/`, a `systemd` service, and
  `postinst` to enable it.

## Configuration

First launch (or installer prompt) collects:

- **Orchestrator URL** (where to be reached from / health-check origin).
- **Agent port** (default `4127`) and optional **`NODE_AGENT_TOKEN`** (shared secret; the
  orchestrator already supports authenticating to the agent — see [Node Agent](Node-Agent.md)).

Stored in an OS-appropriate config dir; the service reads it on start.

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
