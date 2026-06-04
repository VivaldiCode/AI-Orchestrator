import { randomBytes, randomUUID } from 'node:crypto';

export { randomUUID };

/** Short, URL-safe identifier for in-flight requests (for tracing/realtime). */
export function requestId(): string {
  return `req_${randomBytes(9).toString('base64url')}`;
}

/** Current time as an ISO 8601 string. */
export function nowIso(): string {
  return new Date().toISOString();
}
