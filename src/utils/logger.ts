import pino from 'pino';
import { env } from '../config/env';

/**
 * Centralized logger configuration using pino
 * - Development: Pretty formatted output with colors
 * - Production: Structured JSON logging
 */
export const logger = pino({
  level: env.logLevel,
  ...(env.nodeEnv === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
          },
        },
      }
    : {
        timestamp: pino.stdTimeFunctions.isoTime,
        formatters: {
          level: (label) => ({ level: label }),
        },
      }),
});

/**
 * Create child logger with context
 */
export const createLogger = (context: string) => {
  return logger.child({ context });
};

/**
 * Auth-specific logger
 */
export const authLogger = createLogger('AuthGuard');

/**
 * Service-specific logger
 */
export const serviceLogger = createLogger('Service');