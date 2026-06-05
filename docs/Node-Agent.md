# Node Agent (CPU & memory)

> **The agent is optional.** The orchestrator discovers, health-checks, load-balances and routes to
> a node using only Ollama's own API — no agent required. The agent's _only_ job is to add that
> machine's **CPU / memory** to the dashboard. Skip it and everything still works; the node's
> "System" column just shows "—". A node is marked `up` purely from its Ollama endpoint, never from
> the agent.

Ollama doesn't report host CPU/RAM, so to see **per-node CPU and memory** in the dashboard you can
run a tiny **agent** on each machine that hosts Ollama (macOS, Windows, Linux).

The agent is **dependency-free** (Node 18+, just `node:os`) and serves only local system stats — it
never touches Ollama or your data. Source + full install instructions: [`apps/agent`](../apps/agent/README.md).

## Quick start

On each Ollama host, install the **native binary** (no Node required) — see
[Native Agents](Native-Agents.md) — or, if you already have Node, run it directly:

```bash
node apps/agent/agent.cjs            # listens on 0.0.0.0:4127
# or with a shared token:
AGENT_TOKEN=secret node apps/agent/agent.cjs
```

Then, in the dashboard, set the node's **Agent port** (e.g. `4127`). The orchestrator polls
`http://<node-host>:<agent-port>/stats` during its health checks and shows live CPU/memory on the
node cards (Overview) and in the Nodes table.

If you set `AGENT_TOKEN`, set a matching `NODE_AGENT_TOKEN` in the orchestrator's `.env`.

## What it reports

CPU usage %, memory used/total, 1-minute load average, platform/arch and uptime. GPU metrics are on
the roadmap (not portable via `node:os`).

## Keeping it running & security

The **native packages** ([Native Agents](Native-Agents.md)) install a boot service automatically
(systemd / launchd / Scheduled Task). For the run-with-Node path, see
[`apps/agent/README.md`](../apps/agent/README.md) for manual launchd/systemd examples. The agent
exposes only host metrics — still, keep it on a trusted network/VPN and/or set `AGENT_TOKEN`, and
firewall the port to the orchestrator.
