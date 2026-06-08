<div align="center">

<img src="assets/logo/ai-orchestrator-logo.svg" alt="AI Orchestrator" width="420" />

# AI Orchestrator 🎻

**Gateway self-hosted que replica la API de Ollama y balancea la inferencia entre todos tus Macs — y, opcionalmente, entre proveedores de IA en la nube (Anthropic, OpenAI, xAI, Amazon Bedrock).**

[English](README.md) · [Português](README.pt.md) · **Español**

_Como Vivaldi dirigiendo una orquesta — una batuta, muchos instrumentos, en perfecta sincronía._

</div>

---

> La documentación completa está en inglés en [`docs/`](docs/). Esta es una visión general en
> español — las contribuciones de traducción son muy bienvenidas.

## Por qué

Tienes varios Macs ejecutando [Ollama](https://ollama.com), pero cada uno se usa de forma
aislada — uno se derrite mientras los demás están ociosos. **AI Orchestrator** es un espejo
_drop-in_ de la API REST de Ollama: apunta tus clientes hacia él y la carga se distribuye entre
todos los nodos, con health checks, failover automático, dashboard en tiempo real y analíticas.

Es **100% open source** (MIT) y está construido con **la seguridad como prioridad**.

## ✨ Características

- **Espejo drop-in de Ollama** — todos los endpoints, con streaming. Cambia la URL base y listo.
- **Balanceo inteligente** — round-robin, least-connections, least-latency, weighted, además de
  enrutamiento consciente del modelo y failover automático.
- **Multi-proveedor** — capa compatible con OpenAI (`/v1`) para proveedores en la nube; secretos
  cifrados en reposo.
- **Dashboard en tiempo real** (React + Vite) — trilingüe (EN/PT/ES).
- **Analíticas** — rendimiento, latencia p50/p95/p99, tokens y errores, con PostgreSQL + TimescaleDB.
- **Funciona 100% en Docker** y **nace con tests** (unit + e2e).

## 🚀 Inicio rápido (Docker)

```bash
git clone https://github.com/VivaldiCode/ollama-orquestrator.git
cd ollama-orquestrator
cp .env.example .env
# Genera secretos fuertes (ORCHESTRATOR_MASTER_KEY y JWT_SECRET):
#   openssl rand -base64 32
docker compose up -d --build
open http://localhost:8080   # crea el primer admin y añade tus Macs
```

Apunta cualquier cliente Ollama a `http://localhost:11435`.

## 📚 Documentación

La documentación completa (en inglés) está en [`docs/`](docs/). Empieza por
[`docs/Home.md`](docs/Home.md).

## 📝 Licencia

[MIT](LICENSE) © VivaldiCode. Coautoría: **Claude** (Anthropic).
</content>
</invoke>
