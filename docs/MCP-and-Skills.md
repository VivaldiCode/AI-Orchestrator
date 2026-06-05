# MCP Servers & Skills (Triage Node)

> **Status: phase 1 shipped.** AI Orchestrator can optionally enrich requests with
> [Model Context Protocol](https://modelcontextprotocol.io) (MCP) tools and reusable **Skills**,
> via an **opt-in triage step**. Phase 1 (below) is built and verified; the autonomous
> tool-call loop is phase 2.

## What's shipped (phase 1)

- **MCP server registry** (dashboard → **MCP Servers**): add HTTP/stdio servers (auth token
  encrypted at rest), **discover** their tools, and **allow-list** which tools triage may use.
  Built on the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/typescript-sdk).
- **Skills registry** (dashboard → **Skills**): a system prompt + preferred model + tool preset.
- **Triage** (opt-in, **Settings → Triage**): when on, a chat request that names a `skill` gets that
  skill's system prompt prepended and its model applied, and allow-listed MCP tools are advertised
  to the model. Disabled (default) or non-chat requests pass through untouched; clients can bypass
  per-request with the `x-triage: off` header.

**Phase 2 (planned):** the autonomous loop — execute the model's tool calls against the MCP server
and feed results back over multiple turns (bounded by **Max tool calls**), plus automatic skill
selection by intent. Today phase 1 _advertises_ tools and applies skills.

## Quick use

1. **MCP Servers** → add a server (e.g. an HTTP MCP at `http://host:3000/mcp`) → **Discover** →
   tick the tools you want under **Tools**.
2. **Skills** → add a skill (system prompt, optional model, optional tool preset).
3. **Settings** → enable **Triage**.
4. Call `/api/chat` (or `/v1/chat/completions`) with a `"skill": "<name>"` field to apply it.

## The idea

Sometimes you just want raw load-balancing: "I know the model, spread the calls." Other times you
want the gateway to be smart: "look at this request, decide if it needs a tool (web search, a
database, a file system) or a packaged skill, and only then route it."

The **triage node** is that optional brain. It sits _in front of_ routing and is **fully opt-in**:

- **Off (default):** requests flow straight to the [load balancer](Load-Balancing-Strategies.md).
  Zero overhead — ideal when you're only doing heavy load and already know the model.
- **On:** each request first hits triage, which may attach MCP tools / select a skill / pick a
  better model, then hands off to the same load balancer.

```
                    ┌─────────────── triage ENABLED ───────────────┐
client ──► request ─┤                                               ├─► load balancer ─► node/provider
                    │  1. classify intent (cheap/fast model)        │
                    │  2. choose Skill (prompt + tool preset)?      │
                    │  3. attach MCP tools (allowlisted servers)?   │
                    │  4. pick/upgrade model for the task?          │
                    └───────────────────────────────────────────────┘
        triage DISABLED ──► straight to load balancer (no extra hop)
```

## MCP servers

MCP is an open standard for exposing **tools**, **resources** and **prompts** to models over a
uniform JSON-RPC transport (stdio or HTTP/SSE). The orchestrator will act as an **MCP client**:

- Register MCP servers in the dashboard: `{ name, transport, url/command, auth, enabled }`.
- Secrets encrypted at rest (AES-256-GCM), like provider credentials.
- Discover each server's tool list; expose an **allowlist** per server (and later per API key).
- During triage, eligible tools are advertised to the model; tool calls are executed against the
  MCP server and results fed back, then the final answer is returned to the client.

Transport support order: **stdio** (local servers) → **streamable HTTP/SSE** (remote servers).

## Skills

A **Skill** is a reusable, versioned bundle that packages _how_ to do a class of task:

```
skill(
  id, name, description, version,
  system_prompt,            -- task framing
  tool_preset jsonb,        -- which MCP tools/servers it needs
  model_hint text,          -- preferred model/capability tier
  examples jsonb,           -- few-shot (optional)
  enabled
)
```

Triage can select a skill by intent (or the client can request one explicitly, e.g. a
`skill: "sql-analyst"` field / header). Skills are inert data until invoked — no code execution in
the gateway itself.

## Routing interplay

Triage runs **before** strategy selection and composes with what already exists:

- It may **raise the model requirement** (e.g. force a larger-context or higher-quality model);
  [context-aware routing](Load-Balancing-Strategies.md) then guarantees a node that fits.
- It respects per-node **model allowlists**.
- Tool round-trips can fan out to multiple providers/nodes; each hop is metered into
  [analytics](Analytics.md).

## Performance & safety

- **Opt-in & bypassable** per request (header) and globally (setting) — never pay for triage you
  don't want.
- Triage uses a **small, fast model** by default (configurable), kept separate from the workload
  model.
- Hard timeouts and a max tool-call budget per request to bound latency and cost.
- MCP servers are **allowlisted**; tool calls are logged and attributable to an API key.
- Prompt-injection mitigations: tool outputs are clearly delimited and never auto-escalate
  privileges.

## Data model (additive)

```
mcp_servers(id, name, transport, endpoint, auth(encrypted), enabled, created_at)
mcp_tools(id, server_id, name, schema jsonb, allowed boolean)   -- discovered + allowlist
skills(id, name, version, system_prompt, tool_preset, model_hint, enabled, created_at)
settings: triage_enabled boolean, triage_model text, triage_max_tool_calls int
```

## Rollout

1. MCP **client** + server registry (stdio), tool discovery & allowlist.
2. **Triage** step (opt-in), intent classification, tool attachment.
3. **Skills** registry + selection (explicit, then automatic).
4. Remote MCP (HTTP/SSE), per-API-key tool scoping, richer skill marketplace.

## Candidate dependencies (to be audited)

The official **`@modelcontextprotocol/sdk`** (MIT) is the reference client and the likely choice,
vetted per our [dependency policy](Security.md). A minimal JSON-RPC client over `fetch`/stdio is
the fallback if we want zero new runtime deps for the first cut.

See also: [Load-Balancing Strategies](Load-Balancing-Strategies.md) · [Security](Security.md) ·
[Roadmap](Roadmap.md).
