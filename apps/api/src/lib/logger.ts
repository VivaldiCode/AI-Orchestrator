import { pino, type LoggerOptions } from 'pino';
import { config } from '../config/index';

export const loggerOptions: LoggerOptions = {
  level: config.logLevel,
  // Never leak secrets into logs.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      '*.apiKey',
      '*.password',
      '*.secret',
      '*.secretAccessKey',
      '*.accessKeyId',
      '*.refreshToken',
      '*.accessToken',
    ],
    censor: '[redacted]',
  },
};

// Pretty, human-friendly logs in development only.
if (config.isDev) {
  loggerOptions.transport = {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
  };
}

/** Standalone logger used by modules outside the Fastify request lifecycle. */
export const logger = pino(loggerOptions);
export type Logger = typeof logger;
