# Roadmap

AI Orchestrator is young. Contributions toward any of these are very welcome.

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
- [ ] Role-based access (viewer vs admin) enforced in the dashboard
- [ ] WebSocket auth hardening (mandatory token)

## Nice to have

- [ ] Multi-tenant workspaces
- [ ] Canary / weighted model rollout
- [ ] Helm chart for Kubernetes
- [ ] Dark/light dashboard themes

See an item you want? Open an issue or a PR — see [CONTRIBUTING.md](../CONTRIBUTING.md).
