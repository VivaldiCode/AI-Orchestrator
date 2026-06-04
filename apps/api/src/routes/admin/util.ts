import type { z } from 'zod';
import { badRequest } from '../../lib/errors';

/** Validate `data` against a Zod schema, throwing a 400 with issue details. */
export function parseWith<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw badRequest('Validation failed.', result.error.issues);
  }
  return result.data;
}

export function pathId(params: unknown): string {
  return (params as { id: string }).id;
}
