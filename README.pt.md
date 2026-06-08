<div align="center">

<img src="assets/logo/ai-orchestrator-logo.svg" alt="AI Orchestrator" width="420" />

# AI Orchestrator 🎻

**Gateway self-hosted que espelha a API do Ollama e balanceia a inferência entre todos os seus Macs — e, opcionalmente, entre provedores de IA na nuvem (Anthropic, OpenAI, xAI, Amazon Bedrock).**

[English](README.md) · **Português** · [Español](README.es.md)

_Como Vivaldi regendo uma orquestra — uma batuta, muitos instrumentos, em perfeita sintonia._

</div>

---

> A documentação completa está em inglês em [`docs/`](docs/). Esta é uma visão geral em
> português — contribuições de tradução são muito bem-vindas.

## Por quê

Você tem vários Macs rodando [Ollama](https://ollama.com), mas cada um é usado de forma
isolada — um derrete enquanto os outros ficam ociosos. O **AI Orchestrator** é um espelho
_drop-in_ da API REST do Ollama: aponte seus clientes para ele e a carga é distribuída entre
todos os nós, com health checks, failover automático, dashboard em tempo real e analytics.

É **100% open source** (MIT) e construído com **segurança em primeiro lugar**.

## ✨ Recursos

- **Espelho drop-in do Ollama** — todos os endpoints, com streaming. Troque a URL base e pronto.
- **Balanceamento inteligente** — round-robin, least-connections, least-latency, weighted, além
  de roteamento ciente de modelo e failover automático.
- **Multi-provedor** — camada compatível com OpenAI (`/v1`) para provedores na nuvem; segredos
  criptografados em repouso.
- **Dashboard em tempo real** (React + Vite) — bilíngue (EN/PT).
- **Analytics** — vazão, latência p50/p95/p99, tokens e erros, com PostgreSQL + TimescaleDB.
- **Roda 100% em Docker** e **nasce com testes** (unit + e2e).

## 🚀 Início rápido (Docker)

```bash
git clone https://github.com/VivaldiCode/ollama-orquestrator.git
cd ollama-orquestrator
cp .env.example .env
# Gere segredos fortes (ORCHESTRATOR_MASTER_KEY e JWT_SECRET):
#   openssl rand -base64 32
docker compose up -d --build
open http://localhost:8080   # crie o primeiro admin e adicione seus Macs
```

Aponte qualquer cliente Ollama para `http://localhost:11435`.

## 📚 Documentação

A documentação completa (em inglês) está em [`docs/`](docs/). Comece por
[`docs/Home.md`](docs/Home.md).

## 📝 Licença

[MIT](LICENSE) © VivaldiCode. Coautoria: **Claude** (Anthropic).
