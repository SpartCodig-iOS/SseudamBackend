import { env } from '../config/env';

type LogLevel = 'error' | 'info' | 'debug';

type LogPayload = Record<string, unknown> | undefined;

const levelPriority: Record<LogLevel, number> = {
  error: 0,
  info: 1,
  debug: 2,
};

const resolveLevel = (value?: string): LogLevel => {
  if (!value) return 'info';
  const normalized = value.toLowerCase() as LogLevel;
  return normalized in levelPriority ? normalized : 'info';
};

const activeLevel = resolveLevel(env.logLevel);

const shouldLog = (level: LogLevel) => levelPriority[level] <= levelPriority[activeLevel];

const serializeMeta = (meta?: LogPayload) => {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (_error) {
    return ' [unserializable-metadata]';
  }
};

const write = (level: LogLevel, message: string, meta?: LogPayload) => {
  if (!shouldLog(level)) return;
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${level.toUpperCase()} ${message}${serializeMeta(meta)}`;
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
};

export const logger = {
  error: (message: string, meta?: LogPayload) => write('error', message, meta),
  info: (message: string, meta?: LogPayload) => write('info', message, meta),
  debug: (message: string, meta?: LogPayload) => write('debug', message, meta),
  level: activeLevel,
};

export type { LogLevel };
