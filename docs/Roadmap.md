# Roadmap

AI Orchestrator is young. Contributions toward any of these are very welcome.

## Recently shipped

- [x] Node agent for CPU/memory metrics ([Node Agent](Node-Agent.md))
- [x] **Context-aware routing** — token-fit with auto-discovered context windows ([strategies](Load-Balancing-Strategies.md))
- [x] **Per-node model selection** — `enabledModels` allowlist ([strategies](Load-Balancing-Strategies.md))
- [x] **Users & role-based access** — admin / editor / viewer + permissions ([Users & Roles](Users-and-Roles.md))

## Planned (designed — see RFCs)

- [ ] **OAuth / OIDC SSO** — Google, Microsoft, Okta ([RFC](Authentication-OAuth.md))
- [ ] **MCP servers & Skills** via an opt-in triage node ([RFC](MCP-and-Skills.md))
- [ ] **Native agents** — `.deb` / `.exe` / `.app` one-click install ([RFC](Native-Agents.md))
- [ ] Quick per-call model analysis (speed vs quality) feeding triage

## Near term

- [ ] Streaming for Anthropic & Bedrock adapters
- [ ] Broadcast model management (pull/delete across all nodes)
- [ ] Streamed (non-buffered) request bodies for large blob pushes
- [ ] Per-API-key quotas and usage limits
- [ ] Cost estimation for cloud providers in analytics

## Medium term

- [ ] Continuous aggregates / retention policies for long-term analytics
- [ ] Auto-pull missing models on the chosen node
- [ ] Prometheus / OpenTelemetry metrics export
- [ ] Per-user permission overrides editable in the dashboard (model already supports it)
- [ ] WebSocket auth hardening (mandatory token)

## Nice to have

- [ ] Multi-tenant workspaces
- [ ] Canary / weighted model rollout
- [ ] Helm chart for Kubernetes

See an item you want? Open an issue or a PR — see [CONTRIBUTING.md](../CONTRIBUTING.md).
