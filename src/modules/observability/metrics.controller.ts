/**
 * MetricsController
 *
 * GET /metrics — Prometheus scrape 엔드포인트.
 * 기존 JSON 형식의 /metrics (HealthController)와 완전히 분리한다.
 *
 * 접근 제어:
 *   - X-Metrics-Key 헤더 (METRICS_API_KEY 환경변수와 일치 시 허용)
 *   - 내부 사설 IP 대역
 *   - 개발/테스트 환경 무조건 허용
 */
import {
  Controller,
  Get,
  Req,
  Res,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';
import { env } from '../../config/env';

const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,
  /^::1$/,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^fd[0-9a-f]{2}:/i,
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_IP_PATTERNS.some((p) => p.test(ip?.trim() ?? ''));
}

function resolveClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0]
      .trim();
  }
  return req.ip ?? req.socket?.remoteAddress ?? '';
}

function assertMetricsAccess(req: Request): void {
  const metricsApiKey = process.env['METRICS_API_KEY'];
  if (metricsApiKey && req.headers['x-metrics-key'] === metricsApiKey) {
    return;
  }
  if (isPrivateIp(resolveClientIp(req))) return;
  if (env.nodeEnv === 'development' || env.nodeEnv === 'test') return;

  throw new UnauthorizedException(
    'Access to /metrics is restricted to internal networks or requires a valid API key',
  );
}

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: AppMetricsService) {}

  /**
   * Prometheus 형식 메트릭 엔드포인트.
   * Prometheus scraper가 이 경로를 polling한다.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  async getPrometheusMetrics(@Req() req: Request, @Res() res: Response) {
    assertMetricsAccess(req);

    const [text, contentType] = await Promise.all([
      this.metricsService.getMetricsAsText(),
      Promise.resolve(this.metricsService.getContentType()),
    ]);

    res.set('Content-Type', contentType);
    res.send(text);
  }
}
