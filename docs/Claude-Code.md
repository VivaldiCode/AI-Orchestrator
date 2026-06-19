# Using Claude Code through the orchestrator

The orchestrator exposes an **Anthropic Messages API** surface (`POST /v1/messages`)
— the same API [Claude Code](https://claude.com/claude-code) speaks. Point Claude
Code at the orchestrator and every request flows through the full system:
load-balancing across your Macs, cloud overflow, budgets, cost tracking, the
prompt/response archive, analytics, and the live-requests view.

It sits alongside the existing surfaces — the Ollama mirror (`/api/*`) and the
OpenAI-compatible layer (`/v1/*`) — so one gateway now answers **three** API
dialects.

## How it routes

When a request hits `/v1/messages`, the orchestrator decides where it goes:

| The requested model…                                                                                                 | Goes to                                                                         | Fidelity                               |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------- |
| maps to an **Anthropic** provider (or is an unmapped `claude-*` model and you have an Anthropic provider configured) | **passthrough** to the real Anthropic API with your provider key                | full (native tools + streaming)        |
| maps to a **local model** via the model registry                                                                     | **translated** Anthropic⇄OpenAI and dispatched to your **Macs** (with failover) | best-effort (text + tools + streaming) |
| maps to an **OpenAI-compatible** provider                                                                            | translated and sent to that provider                                            | best-effort                            |
| (nodes saturated, overflow enabled)                                                                                  | spills to a cloud provider                                                      | best-effort                            |

Translation covers system prompts, multi-turn messages, images, **tool calling**
(`tool_use`/`tool_result` ⇄ OpenAI `tool_calls`), `tool_choice`, sampling
parameters, and the streaming event protocol (`message_start` →
`content_block_*` → `message_delta` → `message_stop`, including
`input_json_delta` for streamed tool arguments).

## 1. Create an orchestrator API key

In the dashboard, go to **API Keys** and create one. This is the key Claude Code
will send to the orchestrator — **not** your real Anthropic key. (If no API key
exists yet, the inference surface is open and any token works.)

## 2. Point Claude Code at the orchestrator

Claude Code reads its endpoint and credential from the environment:

```bash
# The orchestrator's Ollama/OpenAI/Anthropic API port (NOT the dashboard :8080)
export ANTHROPIC_BASE_URL="http://<orchestrator-host>:11435"

# Your *orchestrator* API key (either variable works):
export ANTHROPIC_AUTH_TOKEN="sk-orch-..."   # sent as: Authorization: Bearer <key>
# or
export ANTHROPIC_API_KEY="sk-orch-..."      # sent as: x-api-key: <key>

claude
```

Both `Authorization: Bearer` and `x-api-key` are accepted.

## 3a. Passthrough — use your Anthropic account, governed

Add your Anthropic key as a **provider** (Providers → add → Anthropic). Now
Claude Code's `claude-*` models pass through to Anthropic, but every request is
metered: it counts toward the provider's **monthly budget** (over budget → the
request is blocked), its **cost** is recorded per model price, and the full
prompt/response is written to the **archive**. You keep Claude Code's native
behaviour while gaining observability and a budget guardrail.

## 3b. Local — run Claude Code on your Macs

Map the Claude model name to a local model in **Model Routes**:

| Alias (what Claude Code asks for) | Target (a model your nodes have) |
| --------------------------------- | -------------------------------- |
| `claude-3-5-sonnet-20241022`      | `qwen2.5-coder:32b`              |
| `claude-3-5-haiku-20241022`       | `llama3.1:8b`                    |

Requests for that alias are translated and load-balanced across your nodes. Tool
calls work as long as the target model supports function calling. Latency and
quality depend on the local model — this is best-effort, not Anthropic parity.

> **Privacy mode.** With global privacy mode (or a per-request `x-local-only: 1`
> header), a model that resolves to any cloud provider — including Anthropic
> passthrough — is **blocked**, so prompts never leave your machines.

## count_tokens

`POST /v1/messages/count_tokens` returns an `{ "input_tokens": N }` estimate so
Claude Code can size context before sending. It is an approximation
(~4 chars/token), not a billed call.

## Quick test

```bash
curl -s http://<orchestrator-host>:11435/v1/messages \
  -H 'content-type: application/json' \
  -H 'x-api-key: <your-orchestrator-key>' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{
    "model": "claude-3-5-sonnet-20241022",
    "max_tokens": 64,
    "messages": [{ "role": "user", "content": "Say hi in 3 words." }]
  }'
```

You should get an Anthropic `message` object back, and the call should appear in
the dashboard's **Live requests** with its node/provider, tokens, and latency.
