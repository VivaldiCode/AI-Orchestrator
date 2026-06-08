import { z } from 'zod';

/**
 * Per-model price. `provider` matches the analytics provider key (`ollama` for
 * the local cluster, or a provider type like `openai`). `model` is a model name
 * or `*` for a provider-wide default. Rates are USD per 1,000,000 tokens.
 */
export const modelPriceSchema = z.object({
  id: z.uuid(),
  provider: z.string(),
  model: z.string(),
  inputPerMtok: z.number(),
  outputPerMtok: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ModelPrice = z.infer<typeof modelPriceSchema>;

export const createModelPriceSchema = z.object({
  provider: z.string().min(1).max(100),
  model: z.string().min(1).max(200),
  inputPerMtok: z.number().min(0).max(1_000_000),
  outputPerMtok: z.number().min(0).max(1_000_000),
});
export type CreateModelPriceInput = z.infer<typeof createModelPriceSchema>;

export const updateModelPriceSchema = createModelPriceSchema.partial();
export type UpdateModelPriceInput = z.infer<typeof updateModelPriceSchema>;
