/**
 * pino-logger.ts
 *
 * pino 기반 구조화 로거.
 * - 기존 utils/logger.ts API와 완전 호환 (error / info / debug)
 * - 모든 로그에 requestId 자동 포함 (AsyncLocalStorage)
 * - 프로덕션: JSON 출력
 * - 개발: pino-pretty 컬러 출력
 * - NestJS Logger 인터페이스를 구현해 app.useLogger()에 바로 주입 가능
 */
import pino, { Logger as PinoLogger } from 'pino';
import { LoggerService } from '@nestjs/common';
import { RequestContext } from '../context/request-context';

// ─────────────────────────────────────────────
// 레벨 설정
// ─────────────────────────────────────────────

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isDev = nodeEnv === 'development';
const rawLevel = (process.env.LOG_LEVEL ?? 'info').toLowerCase();

// pino 레벨 이름으로 정규화 (silent / fatal / error / warn / info / debug / trace)
const LEVEL_MAP: Record<string, string> = {
  verbose: 'trace',
  debug:   'debug',
  info:    'info',
  warn:    'warn',
  error:   'error',
  silent:  'silent',
};
const pinoLevel = LEVEL_MAP[rawLevel] ?? 'info';

// ─────────────────────────────────────────────
// pino 인스턴스 생성
// ─────────────────────────────────────────────

const transport = isDev
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
        messageKey: 'msg',
      },
    }
  : undefined;

const basePino: PinoLogger = pino({
  level: pinoLevel,
  transport,
  // 프로덕션에서는 hostname 포함
  base: isDev ? null : undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  // 직렬화: Error 객체를 JSON으로 변환
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
});

// ─────────────────────────────────────────────
// requestId를 자동 포함하는 child logger 헬퍼
// ─────────────────────────────────────────────

function getChild(): PinoLogger {
  const requestId = RequestContext.getRequestId();
  const userId = RequestContext.getUserId();

  // 'unknown'이면 requestId 필드 생략 (부트스트랩 로그 등 컨텍스트 밖 호출)
  if (requestId === 'unknown') {
    return basePino;
  }

  const bindings: Record<string, string> = { requestId };
  if (userId) bindings.userId = userId;
  return basePino.child(bindings);
}

// ─────────────────────────────────────────────
// 공개 로거 API (기존 utils/logger.ts 호환)
// ─────────────────────────────────────────────

type LogPayload = Record<string, unknown> | Error | undefined;

export const pinoLogger = {
  error(message: string, meta?: LogPayload): void {
    const child = getChild();
    if (meta instanceof Error) {
      child.error({ err: meta }, message);
    } else {
      child.error(meta ?? {}, message);
    }
  },

  warn(message: string, meta?: LogPayload): void {
    const child = getChild();
    if (meta instanceof Error) {
      child.warn({ err: meta }, message);
    } else {
      child.warn(meta ?? {}, message);
    }
  },

  info(message: string, meta?: LogPayload): void {
    const child = getChild();
    if (meta instanceof Error) {
      child.info({ err: meta }, message);
    } else {
      child.info(meta ?? {}, message);
    }
  },

  debug(message: string, meta?: LogPayload): void {
    const child = getChild();
    if (meta instanceof Error) {
      child.debug({ err: meta }, message);
    } else {
      child.debug(meta ?? {}, message);
    }
  },

  /** 기존 코드 호환용 level 프로퍼티 */
  level: pinoLevel,

  /** 원본 pino 인스턴스 (직접 접근이 필요한 경우) */
  instance: basePino,
};

// ─────────────────────────────────────────────
// NestJS LoggerService 어댑터
// app.useLogger(new PinoNestLogger()) 로 사용
// ─────────────────────────────────────────────

export class PinoNestLogger implements LoggerService {
  log(message: unknown, context?: string): void {
    pinoLogger.info(String(message), context ? { context } : undefined);
  }

  error(message: unknown, trace?: string, context?: string): void {
    pinoLogger.error(String(message), { trace, context });
  }

  warn(message: unknown, context?: string): void {
    pinoLogger.warn(String(message), context ? { context } : undefined);
  }

  debug(message: unknown, context?: string): void {
    pinoLogger.debug(String(message), context ? { context } : undefined);
  }

  verbose(message: unknown, context?: string): void {
    // verbose → pino trace
    basePino.trace({ context }, String(message));
  }
}
