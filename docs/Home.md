# AI Orchestrator Wiki 🎻

Welcome! **AI Orchestrator** is a self-hosted, open-source gateway that mirrors the
[Ollama](https://ollama.com) API and load-balances inference across all your Macs — and,
optionally, across cloud AI providers (Anthropic, OpenAI, xAI, Amazon Bedrock).

> Like Vivaldi conducting an orchestra: one baton, many instruments, perfectly in time.

## Start here

- [Getting Started](Getting-Started.md) — run the stack and add your first node
- [Installation (Docker)](Installation-Docker.md) — production deployment
- [Configuration](Configuration.md) — environment variables
- [Architecture](Architecture.md) — how the pieces fit together

## Guides

- [Adding Nodes](Adding-Nodes.md)
- [Node Agent — CPU & memory](Node-Agent.md)
- [Native Agents (.deb / .app / .exe)](Native-Agents.md)
- [Load-Balancing Strategies](Load-Balancing-Strategies.md)
- [Adding Providers](Adding-Providers.md)
- [xAI subscription (Grok login)](xAI-Subscription.md)
- [Using Claude Code](Claude-Code.md)
- [MCP Servers & Skills](MCP-and-Skills.md)
- [Dashboard Guide](Dashboard-Guide.md)
- [Analytics](Analytics.md)
- [Users & Roles (RBAC)](Users-and-Roles.md)
- [Authentication & OAuth/SSO](Authentication-OAuth.md)

## Reference

- [API Reference](API-Reference.md)
- [Admin API (no UI)](Admin-API.md)
- [Cost & budgets](Cost-and-Budgets.md)
- [Security](Security.md)
- [Development](Development.md)
- [Testing](Testing.md)
- [Roadmap](Roadmap.md)
- [FAQ](FAQ.md)

## Languages & translations

The dashboard and the landing page ship in **English and Portuguese**, with an in-app language
switcher. These docs are written in English. To contribute a translation, add a dashboard
dictionary under `apps/dashboard/src/i18n/`, a landing locale in `apps/landing/i18n.js`, and wiki
pages under a `docs/<lang>/` folder.

## Publishing this wiki

These Markdown files mirror the GitHub Wiki. To publish them:

```bash
git clone https://github.com/VivaldiCode/ollama-orquestrator.wiki.git
cp docs/*.md ollama-orquestrator.wiki/
cd ollama-orquestrator.wiki && git add . && git commit -m "docs: sync wiki" && git push
```
