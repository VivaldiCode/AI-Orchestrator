import { z } from 'zod';

/** Load-balancing strategies. `model-aware` filtering is an orthogonal flag. */
export const strategySchema = z.enum([
  'round-robin',
  'weighted',
  'least-connections',
  'least-latency',
  'performance',
]);
export type Strategy = z.infer<typeof strategySchema>;

export const STRATEGIES: Strategy[] = [
  'round-robin',
  'weighted',
  'least-connections',
  'least-latency',
  'performance',
];

/** Global orchestrator settings (single row). */
export const settingsSchema = z.object({
  strategy: strategySchema.default('least-connections'),
  /** Only route to nodes that report having the requested model. */
  modelAware: z.boolean().default(true),
  /** Only route to nodes whose model context window fits the request's tokens. */
  contextAware: z.boolean().default(true),
  /** Automatically `pull` a missing model on a target node before routing. */
  autoPull: z.boolean().default(false),
  /** How many other nodes to try when the chosen one fails. */
  failoverRetries: z.number().int().min(0).max(10).default(2),
  /** Opt-in triage step: select a Skill + attach MCP tools before routing. */
  triageEnabled: z.boolean().default(false),
  /** Model used by triage for intent/skill selection (empty = keep requested). */
  triageModel: z.string().max(200).default(''),
  /** Safety cap on MCP tool calls per request (phase-2 autonomous loop). */
  maxToolCalls: z.number().int().min(0).max(50).default(5),
  /**
   * Spill inference to a cloud provider when every candidate node is saturated
   * (in-flight ≥ maxConcurrency) or none are healthy. Off by default (cloud costs).
   */
  cloudOverflow: z.boolean().default(false),
  /**
   * Which provider to overflow to. Empty = the first enabled OpenAI-compatible
   * provider that has both an API key and a default model configured.
   */
  cloudOverflowProviderId: z.string().max(100).default(''),
  /**
   * Privacy mode: force ALL inference to stay on the local cluster — never use
   * cloud providers or cloud overflow. Equivalent to marking every request
   * local-only. Per-request opt-in is also available (header/body flag).
   */
  privacyMode: z.boolean().default(false),
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
