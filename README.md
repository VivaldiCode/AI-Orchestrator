<div align="center">

<img src="assets/logo/ai-orchestrator-logo.svg" alt="AI Orchestrator" width="420" />

# AI Orchestrator 🎻

**Self-hosted gateway that mirrors the Ollama API and load-balances inference across all your Macs — and, optionally, across cloud AI providers (Anthropic, OpenAI, xAI, Amazon Bedrock).**

[![License: MIT](https://img.shields.io/badge/License-MIT-7c3aed.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-339933.svg)](.nvmrc)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178c6.svg)](https://www.typescriptlang.org/)
[![Tests: Vitest + Playwright](https://img.shields.io/badge/tests-vitest%20%2B%20playwright-fcc72b.svg)](#-testing)
[![Made with Docker](https://img.shields.io/badge/docker-compose-2496ed.svg)](docker-compose.yml)

_Like Vivaldi conducting an orchestra — one baton, many instruments, perfectly in time._

**English** · [Português](README.pt.md)

</div>

---

## Why

You have several Macs running [Ollama](https://ollama.com). Today each one is used in
isolation, so one machine melts while the others sit idle. **AI Orchestrator** is a drop-in
mirror of the Ollama REST API: point your clients at it instead of a single machine and it
spreads the load across every node, checks their health, fails over automatically, and gives
you a real-time dashboard and analytics over the whole fleet.

It is **100% open source** (MIT) and built **security-first**.

## ✨ Features

- **Drop-in Ollama mirror** — every Ollama endpoint (`/api/generate`, `/api/chat`,
  `/api/embed`, `/api/tags`, `/api/pull`, …) is proxied, including NDJSON streaming. Your
  existing tools keep working; just change the base URL.
- **Smart load balancing** — `round-robin`, `weighted`, `least-connections`,
  `least-latency`, and **model-aware** routing (only send a request to nodes that actually
  have the model). Automatic **health checks** and **failover**.
- **Multi-provider** — an OpenAI-compatible `/v1/*` layer can also route to cloud providers
  (Anthropic, OpenAI, xAI, Amazon Bedrock). Credentials are **encrypted at rest**.
- **Real-time dashboard** (React + Vite) — see per-Mac load live, add/remove nodes
  (host, port, weight), manage providers, and pick the routing strategy.
- **Analytics** — throughput, latency p50/p95/p99, tokens, error rates, per-node /
  per-model / per-provider breakdowns, powered by **PostgreSQL + TimescaleDB**.
- **Runs entirely in Docker** — `docker compose up` and you are live.
- **Born with tests** — unit + integration (Vitest) and end-to-end (Playwright).
- **Security-first** — Helmet headers, strict CORS, rate limiting, JWT auth, hashed API
  keys, AES-256-GCM secret encryption, and an audited dependency tree.

## 🏛️ Architecture

```
   clients (Ollama API / OpenAI API)
                 │
                 ▼
   ┌─────────────────────────────────────┐
   │        AI Orchestrator (Fastify)     │
   │  Ollama-mirror routes · /v1 compat   │
   │  registry · health · strategies      │
   │  provider adapters · metrics · WS     │
   └───────┬───────────────────┬──────────┘
           │                   │ WebSocket (live)
   ┌───────┼───────┐           ▼
   ▼       ▼       ▼      ┌───────────┐   ┌────────────────────────┐
 Mac1    Mac2    Mac3     │ dashboard │   │ cloud providers         │
 :11434  :11434  :11434   │ React+Vite│   │ Anthropic/OpenAI/xAI/…  │
 (Ollama)(Ollama)(Ollama) └───────────┘   └────────────────────────┘
           │
           ▼
  PostgreSQL + TimescaleDB (config + metrics + analytics)
```

See the [Architecture wiki page](docs/Architecture.md) for the full breakdown.

## 🚀 Quick start (Docker)

```bash
# 1. Clone
git clone https://github.com/VivaldiCode/ollama-orquestrator.git
cd ollama-orquestrator

# 2. Configure — copy the example and generate secrets
cp .env.example .env
# Generate strong values for ORCHESTRATOR_MASTER_KEY and JWT_SECRET:
#   openssl rand -base64 32

# 3. Launch the stack (orchestrator + dashboard + TimescaleDB)
docker compose up -d --build

# 4. Open the dashboard and create the first admin user
open http://localhost:8080
```

Then add your Macs in the dashboard (host + port, e.g. `192.168.0.21:11434`) and point any
Ollama client at the orchestrator:

```bash
# Was: http://192.168.0.21:11434 — now the orchestrator load-balances for you:
curl http://localhost:11435/api/chat -d '{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "Olá!" }]
}'
```

## 🧑‍💻 Local development

```bash
nvm use                 # Node 24
npm install             # installs all workspaces
npm run db:migrate      # apply database migrations (needs a Postgres/Timescale instance)
npm run dev             # api (tsx watch) + dashboard (vite) together
```

| Command                           | Description                                 |
| --------------------------------- | ------------------------------------------- |
| `npm run dev`                     | Run API + dashboard in watch mode           |
| `npm run typecheck`               | Type-check every workspace                  |
| `npm run lint` / `npm run format` | Lint / format                               |
| `npm test`                        | Unit + integration tests (Vitest)           |
| `npm run test:coverage`           | Tests with coverage report                  |
| `npm run test:e2e`                | End-to-end tests (Playwright)               |
| `npm run smoke`                   | Smoke-test load balancing across your nodes |
| `npm run audit`                   | Fail on high/critical dependency advisories |

## 📁 Project structure

```
apps/
  api/         Orchestrator backend (Fastify + TypeScript)
  dashboard/   Real-time control panel (React + Vite + Tailwind)
  landing/     Static marketing landing page (EN/PT)
packages/
  shared/      Zod contracts & types shared by api ⇄ dashboard
docker/        Dockerfiles + nginx config
docs/          GitHub Wiki content
assets/logo/   Brand assets (SVG)
e2e/           Playwright end-to-end tests
```

## 🔒 Security

Security is a first-class goal. Highlights: validated input everywhere (Zod), Helmet
security headers, strict CORS, rate limiting, JWT-based dashboard auth, hashed API keys,
and provider secrets encrypted at rest with AES-256-GCM. See [SECURITY.md](SECURITY.md) and
the [Security wiki page](docs/Security.md). To report a vulnerability, **do not** open a
public issue — follow the process in [SECURITY.md](SECURITY.md).

## 🧪 Testing

- **Unit & integration** — [Vitest](https://vitest.dev): routing strategies, the load
  balancer, crypto, auth, and the API surface via `fastify.inject` against a mock Ollama.
- **End-to-end** — [Playwright](https://playwright.dev): real dashboard flows (login, add a
  node, watch live load, view analytics).

## 📚 Documentation

Full documentation lives in [`docs/`](docs/) (formatted as GitHub Wiki pages). Start at
[`docs/Home.md`](docs/Home.md).

## 🌐 Internationalization

The **dashboard** ships in **English and Portuguese** with an in-app language switcher
(auto-detected from the browser, remembered in `localStorage`), and the **landing page** is
bilingual too. Adding a language is intentionally simple — no i18n framework, just dictionaries:

- Dashboard: copy [`apps/dashboard/src/i18n/en.ts`](apps/dashboard/src/i18n/en.ts), translate the
  values, and register the locale in `apps/dashboard/src/i18n/index.tsx`.
- Landing: add a locale object in [`apps/landing/i18n.js`](apps/landing/i18n.js).

This README and the wiki are written in English; translations are welcome as `README.<lang>.md`
(see [README.pt.md](README.pt.md)) and under `docs/<lang>/`.

## 🤝 Contributing

Contributions are welcome! We use **GitFlow** and **Conventional Commits** — see
[CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## 📝 License

[MIT](LICENSE) © VivaldiCode.

> Authored by **VivaldiCode** (`guilhermecamachop@gmail.com`).
> Co-authored by **Claude** (Anthropic).
