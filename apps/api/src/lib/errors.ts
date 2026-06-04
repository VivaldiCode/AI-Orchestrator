import type { ApiErrorBody } from '@ai-orchestrator/shared';

/** Application-level error carrying an HTTP status and a stable machine code. */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return { error: this.code, message: this.message, details: this.details };
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError(400, 'bad_request', m, d);
export const unauthorized = (m = 'Unauthorized') => new AppError(401, 'unauthorized', m);
export const forbidden = (m = 'Forbidden') => new AppError(403, 'forbidden', m);
export const notFound = (m = 'Not found') => new AppError(404, 'not_found', m);
export const conflict = (m: string) => new AppError(409, 'conflict', m);
export const tooManyRequests = (m = 'Too many requests') =>
  new AppError(429, 'too_many_requests', m);
export const badGateway = (m: string, d?: unknown) => new AppError(502, 'bad_gateway', m, d);
export const serviceUnavailable = (m: string, d?: unknown) =>
  new AppError(503, 'service_unavailable', m, d);
