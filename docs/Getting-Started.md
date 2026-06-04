# Getting Started

## With Docker (recommended)

```bash
git clone https://github.com/VivaldiCode/ollama-orquestrator.git
cd ollama-orquestrator
cp .env.example .env
# Generate secrets and put them in .env:
#   openssl rand -base64 32   # ORCHESTRATOR_MASTER_KEY
#   openssl rand -base64 32   # JWT_SECRET
docker compose up -d --build
```

- Dashboard → http://localhost:8080
- Ollama mirror → http://localhost:11435

Open the dashboard, create the first admin account, then add your Macs.

## Add your Macs

On each Mac, make sure Ollama listens on the network (not just localhost):

```bash
# macOS: allow LAN access
launchctl setenv OLLAMA_HOST 0.0.0.0:11434
# restart Ollama afterwards
```

In the dashboard → **Nodes** → add each Mac by host/IP and port (default `11434`).

## Point your clients at the orchestrator

Anything that speaks the Ollama API works unchanged — just change the base URL:

```bash
curl http://localhost:11435/api/chat -d '{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "Hello!" }]
}'
```

OpenAI-compatible clients work too:

```bash
curl http://localhost:11435/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{ "model": "llama3.2", "messages": [{"role":"user","content":"Hi"}] }'
```

## Local development

See [Development](Development.md).
