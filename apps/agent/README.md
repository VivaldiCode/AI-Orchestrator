# AI Orchestrator — Node Agent

A tiny, **dependency-free** system-metrics bridge. Run it on each machine that hosts Ollama
(macOS, Windows, Linux) so the dashboard can show that node's **CPU and memory** usage.

It only reads local stats via Node's built-in `os` module and serves them over HTTP — it never
touches Ollama or your data.

## Install (native binary — recommended)

Download the package for your OS from the latest release, or build it yourself (needs Node only on
the build machine; `postject` is fetched once via npx, nothing is added to dependencies):

```bash
node build.mjs                 # → build/ai-orchestrator-agent-<os>-<arch>
bash packaging/deb.sh          # Linux  .deb   (installs a systemd service)
bash packaging/macos-app.sh    # macOS  .app + .pkg (launchd)
pwsh packaging/windows.ps1     # Windows .zip  (exe + Scheduled Task)
```

The target machine needs **no Node install** — the binary bundles its own runtime. Config (`port`,
`host`, `token`) is read from `agent.config.json` beside the binary, `$AGENT_CONFIG`, or env vars.
See [Native Agents](../../docs/Native-Agents.md).

## Run with Node (alternative)

Requires Node.js **18+** (`node --version`). Copy `agent.cjs` to the machine and run:

```bash
node agent.cjs
# custom port / token:
PORT=4127 AGENT_TOKEN=your-shared-secret node agent.cjs
```

| Env            | Default   | Description                                                       |
| -------------- | --------- | ----------------------------------------------------------------- |
| `PORT`         | `4127`    | port to listen on                                                 |
| `HOST`         | `0.0.0.0` | bind address                                                      |
| `AGENT_TOKEN`  | _(none)_  | if set, `/stats` requires `Authorization: Bearer <token>`         |
| `AGENT_CONFIG` | _(none)_  | path to a JSON config (`{port,host,token}`); env vars override it |

Endpoints: `GET /stats` (metrics JSON) and `GET /healthz`.

## Register it in the dashboard

On the node's page in the dashboard, set the **Agent port** (e.g. `4127`). The orchestrator then
polls `http://<node-host>:<agent-port>/stats` during its health checks and shows live CPU/memory.

If you set `AGENT_TOKEN`, also set the matching `NODE_AGENT_TOKEN` on the orchestrator (in `.env`);
it is sent to every agent.

## Keep it running

> The **native packages** above already install a boot service (systemd / launchd / Scheduled Task).
> The examples below are only for the run-with-Node path.

**macOS (launchd)** — `~/Library/LaunchAgents/com.ai-orchestrator.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>Label</key><string>com.ai-orchestrator.agent</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/node</string><string>/path/to/agent.cjs</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
```

`launchctl load ~/Library/LaunchAgents/com.ai-orchestrator.agent.plist`

**Linux (systemd)** — `/etc/systemd/system/ai-orchestrator-agent.service`:

```ini
[Unit]
Description=AI Orchestrator node agent
After=network.target

[Service]
ExecStart=/usr/bin/node /opt/ai-orchestrator/agent.cjs
Environment=PORT=4127
Restart=always

[Install]
WantedBy=multi-user.target
```

`sudo systemctl enable --now ai-orchestrator-agent`

**Windows** — run at startup via Task Scheduler (`node C:\path\to\agent.cjs`) or a service wrapper
such as [NSSM](https://nssm.cc/).

## Security

The agent exposes only host CPU/memory/OS info — no secrets. Still, keep it on a trusted network
(or VPN) and/or set `AGENT_TOKEN`. Restrict the port with your firewall to the orchestrator's IP.

## GPU?

Not yet — `node:os` can't read GPU metrics portably. GPU stats are on the roadmap (likely via an
optional `nvidia-smi` / platform probe).
