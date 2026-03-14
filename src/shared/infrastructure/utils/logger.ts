/**
 * utils/logger.ts
 *
 * 하위 호환 래퍼.
 * 기존 코드는 import { logger } from '../utils/logger' 로 그대로 사용 가능.
 * 내부적으로는 pino 기반 pinoLogger 에 위임한다.
 *
 * 모든 로그에 requestId가 자동 포함된다 (AsyncLocalStorage).
 */
export { pinoLogger as logger } from '../common/logger/pino-logger';
export type { } from '../common/logger/pino-logger';

// LogLevel 타입도 그대로 export (기존 코드 호환)
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';
