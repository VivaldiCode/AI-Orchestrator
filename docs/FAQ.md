# FAQ

### Is it really a drop-in replacement for Ollama?

Yes — every Ollama endpoint is mirrored, including streaming. Point your client's base URL at
the orchestrator (`:11435`) instead of a single machine.

### Do my Macs run inside Docker?

No. Ollama keeps running natively on each Mac. The orchestrator (in Docker) talks to them over
the network. Register each Mac in the dashboard.

### Does it need the cloud providers?

No. The local Ollama cluster is the default and works with zero providers configured. Cloud
providers are optional, via the `/v1` layer and the model registry.

### Why port 11435 and not 11434?

So the orchestrator can run on the same host as an Ollama instance (which uses 11434) without a
clash. Configurable via `API_PORT`.

### Is authentication required?

The dashboard always requires login. Inference is **open until you create the first API key**,
then a `Bearer` key is required — convenient for getting started, secure once locked down.

### Which database do I need?

PostgreSQL with the **TimescaleDB** extension (the bundled `docker-compose.yml` provides it).
For a plain Postgres dev DB, comment out the two TimescaleDB lines in the first migration.

### How are provider secrets stored?

Encrypted at rest with AES-256-GCM (`ORCHESTRATOR_MASTER_KEY`). They're never logged or
returned by the API.

### Is it production-ready?

It's pre-1.0. The Ollama load-balancing path is the most exercised; cloud streaming and a few
hardening items are on the [Roadmap](Roadmap.md). Review [Security](Security.md) before exposing
it publicly.
