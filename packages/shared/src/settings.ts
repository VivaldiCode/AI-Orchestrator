import { z } from 'zod';

/** Load-balancing strategies. `model-aware` filtering is an orthogonal flag. */
export const strategySchema = z.enum([
  'round-robin',
  'weighted',
  'least-connections',
  'least-latency',
]);
export type Strategy = z.infer<typeof strategySchema>;

export const STRATEGIES: Strategy[] = [
  'round-robin',
  'weighted',
  'least-connections',
  'least-latency',
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
});
export type Settings = z.infer<typeof settingsSchema>;

export const updateSettingsSchema = settingsSchema.partial();
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
