# Installation (Docker)

The bundled `docker-compose.yml` runs three services: `postgres` (TimescaleDB), `api`
(orchestrator), and `web` (nginx serving the dashboard + landing and proxying `/admin` & `/ws`).

## Steps

```bash
git clone https://github.com/VivaldiCode/ollama-orquestrator.git
cd ollama-orquestrator
cp .env.example .env
# REQUIRED: set strong secrets
#   openssl rand -base64 32   → ORCHESTRATOR_MASTER_KEY
#   openssl rand -base64 32   → JWT_SECRET
docker compose up -d --build
```

| Service       | URL                            | Notes                  |
| ------------- | ------------------------------ | ---------------------- |
| Dashboard     | http://localhost:8080          | create the first admin |
| Ollama mirror | http://localhost:11435         | point clients here     |
| Landing       | http://localhost:8080/landing/ | marketing page         |

## What runs where

- The **database** stores configuration and metrics (named volume `pgdata`).
- The **api** applies migrations on start, then serves the orchestrator.
- Your **Macs** run Ollama natively (outside this stack) and are reached over the network.

## Production notes

- Put the stack behind a TLS-terminating reverse proxy; set `TRUST_PROXY=true`.
- Pin image digests and set resource limits.
- Back up the `pgdata` volume.
- Restrict `DASHBOARD_ORIGIN` to your real origin.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations are idempotent and applied automatically on `api` start.
