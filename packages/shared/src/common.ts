import { z } from 'zod';

/** A UUID identifier used across all entities. */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/** Standard list pagination, parsed from query strings (hence `coerce`). */
export const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Uniform error envelope returned by the API. */
export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

/** Health endpoint payload. */
export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  uptimeSeconds: z.number().nonnegative(),
  version: z.string(),
});
export type Health = z.infer<typeof healthSchema>;
