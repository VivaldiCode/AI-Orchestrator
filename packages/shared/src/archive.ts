import { z } from 'zod';

/**
 * Metadata for one archived request/response exchange. The actual prompt body
 * and response body live in companion files on disk; this is the index record.
 */
export const archiveEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  method: z.string(),
  endpoint: z.string(),
  model: z.string().nullable(),
  provider: z.string(),
  nodeId: z.string().nullable(),
  nodeName: z.string().nullable(),
  clientIp: z.string().nullable(),
  clientKeyId: z.string().nullable(),
  status: z.number(),
  latencyMs: z.number(),
  promptTokens: z.number().nullable(),
  completionTokens: z.number().nullable(),
  requestBytes: z.number(),
  responseBytes: z.number(),
  requestTruncated: z.boolean(),
  responseTruncated: z.boolean(),
  /** Inbound request headers (authorization/cookie stripped). */
  requestHeaders: z.record(z.string(), z.string()),
});
export type ArchiveEntry = z.infer<typeof archiveEntrySchema>;

/** A page of archived entries for one day (newest first). */
export const archiveListSchema = z.object({
  date: z.string(),
  total: z.number(),
  items: z.array(archiveEntrySchema),
});
export type ArchiveList = z.infer<typeof archiveListSchema>;
