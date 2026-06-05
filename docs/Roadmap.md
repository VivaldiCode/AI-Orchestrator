# Roadmap

AI Orchestrator is young. Contributions toward any of these are very welcome.

## Recently shipped

- [x] Node agent for CPU/memory metrics ([Node Agent](Node-Agent.md))
- [x] **Context-aware routing** — token-fit with auto-discovered context windows ([strategies](Load-Balancing-Strategies.md))
- [x] **Per-node model selection** — `enabledModels` allowlist ([strategies](Load-Balancing-Strategies.md))
- [x] **Users & role-based access** — admin / editor / viewer + permissions, enforced per-route ([Users & Roles](Users-and-Roles.md))
- [x] **OAuth / OIDC SSO** — Google, Microsoft, Okta, generic OIDC ([guide](Authentication-OAuth.md))
- [x] **Native agents** — `.deb` / `.app`+`.pkg` / `.exe` via Node SEA + per-OS CI ([guide](Native-Agents.md))
- [x] **MCP servers & Skills (phase 1)** — registry, discovery, allowlist + opt-in triage ([guide](MCP-and-Skills.md))

## Planned

- [ ] **MCP/Skills phase 2** — autonomous tool-call loop + automatic skill selection by intent ([guide](MCP-and-Skills.md))
- [ ] Quick per-call model analysis (speed vs quality) feeding triage
- [ ] Native agents: signed/notarized installers + auto-update; GPU metrics

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
