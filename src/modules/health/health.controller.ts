import {
  Controller,
  Get,
  Post,
  HttpCode,
  HttpStatus,
  Res,
  UnauthorizedException,
  Req,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response, Request } from 'express';
import { success } from '../../common/types/api.types';
import { CacheService } from '../../common/services/cache.service';
import { getPoolStats } from '../../db/pool';
import { HealthResponseDto } from './dto/health-response.dto';
import { MemoryOptimizer } from '../../common/utils/memory-optimizer';
import { SmartCacheService } from '../../common/services/smart-cache.service';
import { AdaptiveCacheService } from '../../common/services/adaptive-cache.service';
import { PoolMonitorService } from './pool-monitor.service';
import { getPool } from '../../db/pool';
import { env } from '../../config/env';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * 내부 전용 /metrics 엔드포인트 접근을 제한하는 IP 허용 목록 및 API 키 검증
 *
 * 허용 조건 (OR):
 *   1. X-Metrics-Key 헤더가 METRICS_API_KEY 환경변수와 일치
 *   2. 요청 IP가 사설 네트워크 대역(loopback, RFC1918, 컨테이너 브릿지)에 속함
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^127\./,                       // loopback
  /^::1$/,                        // IPv6 loopback
  /^10\./,                        // RFC1918 Class A
  /^172\.(1[6-9]|2\d|3[01])\./,  // RFC1918 Class B
  /^192\.168\./,                  // RFC1918 Class C
  /^fd[0-9a-f]{2}:/i,            // IPv6 ULA (컨테이너 내부 네트워크)
];

function isPrivateIp(ip: string): boolean {
  const normalized = ip?.trim() ?? '';
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(normalized));
}

function resolveClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded)
      .split(',')[0]
      .trim();
  }
  return request.ip ?? request.socket?.remoteAddress ?? '';
}

function assertMetricsAccess(request: Request): void {
  // API Key 검증 (로드밸런서 뒤 프로덕션 환경에서 사용)
  const metricsApiKey = process.env['METRICS_API_KEY'];
  if (metricsApiKey) {
    const providedKey = request.headers['x-metrics-key'];
    if (providedKey === metricsApiKey) {
      return;
    }
  }

  // 내부 IP 허용 (로컬/컨테이너/사설망 요청)
  const clientIp = resolveClientIp(request);
  if (isPrivateIp(clientIp)) {
    return;
  }

  // 개발 환경에서는 항상 허용
  if (env.nodeEnv === 'development' || env.nodeEnv === 'test') {
    return;
  }

  throw new UnauthorizedException(
    'Access to /metrics is restricted to internal networks or requires a valid API key',
  );
}

@ApiTags('Health')
@Controller()
export class HealthController {
  private lastHealthCheck: { result: 'ok' | 'unavailable'; timestamp: number } | null = null;
  private readonly HEALTH_CACHE_TTL = 5 * 1000; // 5초 캐시

  constructor(
    private readonly cacheService: CacheService,
    private readonly smartCacheService: SmartCacheService,
    private readonly adaptiveCacheService: AdaptiveCacheService,
    private readonly poolMonitorService: PoolMonitorService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  private async checkDatabaseHealth(): Promise<'ok' | 'unavailable'> {
    try {
      const pool = await getPool();
      if (!pool) {
        return 'unavailable';
      }

      // 빠른 연결 테스트 (1초 타임아웃)
      const client = await pool.connect();
      try {
        await client.query('SELECT 1');
        return 'ok';
      } finally {
        client.release();
      }
    } catch (error) {
      console.warn('Database health check failed:', error instanceof Error ? error.message : 'Unknown error');
      return 'unavailable';
    }
  }

  private async refreshHealthAsync(): Promise<void> {
    void (async () => {
      const database = await Promise.race([
        this.checkDatabaseHealth(),
        new Promise<'unavailable'>((resolve) => setTimeout(() => resolve('unavailable'), 1000)),
      ]);
      this.lastHealthCheck = { result: database, timestamp: Date.now() };
    })();
  }

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '서버 상태 확인 (빠른 응답)' })
  @ApiOkResponse({ description: '서버 상태 정보' })
  async health() {
    // 기본 서버 상태만 체크 (데이터베이스 체크 제외)
    const uptime = process.uptime();
    const memoryUsage = process.memoryUsage();

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor(uptime),
      memory: {
        used: Math.round(memoryUsage.rss / 1024 / 1024),
        heap: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      },
      nodeEnv: env.nodeEnv || 'unknown',
    };
  }

  @Get('health/full')
  @ApiOperation({ summary: '서버 및 데이터베이스 전체 상태 확인' })
  @ApiOkResponse({ description: '전체 상태 정보' })
  async fullHealth(@Res() res: Response) {
    const now = Date.now();
    const cached = this.lastHealthCheck;

    // 캐시된 결과가 유효한 경우 즉시 응답
    if (cached && (now - cached.timestamp) < this.HEALTH_CACHE_TTL) {
      const statusCode = cached.result === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
      return res.status(statusCode).json(success({
        status: cached.result === 'ok' ? 'ok' : 'degraded',
        database: cached.result,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      }));
    }

    // 캐시 만료 시: 비동기 갱신 후 캐시된 결과로 즉시 응답
    if (cached) {
      this.refreshHealthAsync();
      const statusCode = cached.result === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
      return res.status(statusCode).json(success({
        status: cached.result === 'ok' ? 'ok' : 'degraded',
        database: cached.result,
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      }));
    }

    // 첫 호출 시 동기 헬스 체크 (타임아웃 1초)
    const database = await Promise.race([
      this.checkDatabaseHealth(),
      new Promise<'unavailable'>((resolve) => setTimeout(() => resolve('unavailable'), 1000)),
    ]);

    this.lastHealthCheck = { result: database, timestamp: now };

    const statusCode = database === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    return res.status(statusCode).json(success({
      status: database === 'ok' ? 'ok' : 'degraded',
      database,
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    }));
  }

  @Get('health/debug/expenses/:travelId')
  @HttpCode(HttpStatus.OK)
  async debugExpenses(@Req() req: Request, @Res() res: Response) {
    assertMetricsAccess(req);

    const travelId = req.params.travelId;

    try {
      // TypeORM을 사용한 간단한 존재 확인
      const travelRepository = this.dataSource.getRepository('Travel');
      const travel = await travelRepository.findOne({
        where: { id: travelId },
        select: ['id'] // 필요한 필드만 선택
      });

      const travelExists = !!travel;

      // 추가적으로 경비 개수도 확인
      const expenseRepository = this.dataSource.getRepository('TravelExpense');
      const expenseCount = await expenseRepository.count({
        where: { travelId }
      });

      return res.json({
        travelId,
        travelExists,
        expenseCount,
        timestamp: new Date().toISOString(),
        status: travelExists ? 'found' : 'not_found'
      });

    } catch (error) {
      return res.status(500).json({
        error: 'TypeORM query failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  @Post('health/cache/clear/:travelId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '여행 캐시 강제 삭제 (내부 전용)' })
  async clearTravelCache(@Req() req: Request, @Res() res: Response) {
    assertMetricsAccess(req);

    const travelId = req.params.travelId;

    try {
      if (!travelId || !travelId.match(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)) {
        return res.status(400).json({ error: 'Invalid travel ID format' });
      }

      // Clear all travel-related caches using CacheService methods
      await this.cacheService.invalidateTravelCache(travelId);

      // Also clear specific expense patterns
      const additionalPatterns = [
        `expense:list:${travelId}:*`,
        `expense:detail:${travelId}:*`,
        `expense:context:${travelId}`,
      ];

      let totalDeleted = 0;
      for (const pattern of additionalPatterns) {
        totalDeleted += await this.cacheService.delPattern(pattern);
      }

      return res.json({
        success: true,
        travelId,
        message: 'Travel cache cleared successfully',
        deletedPatterns: totalDeleted,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        travelId,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      });
    }
  }

  @Get('health/metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '시스템 상태 JSON 메트릭 (내부 전용) — Prometheus 형식은 GET /metrics 사용' })
  @ApiOkResponse({
    description: '시스템 성능 메트릭',
    schema: {
      type: 'object',
      properties: {
        code: { type: 'integer', example: 200 },
        message: { type: 'string', example: 'Success' },
        data: {
          type: 'object',
          properties: {
            server: {
              type: 'object',
              properties: {
                uptime: { type: 'number', example: 3600.5 },
                memory: {
                  type: 'object',
                  properties: {
                    used: { type: 'string', example: '45.2 MB' },
                    total: { type: 'string', example: '512 MB' },
                    percentage: { type: 'number', example: 8.8 },
                  },
                },
                cpu: {
                  type: 'object',
                  properties: {
                    usage: { type: 'number', example: 15.2 },
                  },
                },
              },
            },
            database: {
              type: 'object',
              properties: {
                pool: {
                  type: 'object',
                  properties: {
                    total: { type: 'number', example: 15 },
                    idle: { type: 'number', example: 12 },
                    active: { type: 'number', example: 3 },
                    waiting: { type: 'number', example: 0 },
                  },
                },
              },
            },
            cache: {
              type: 'object',
              properties: {
                redis: { type: 'object' },
                fallback: {
                  type: 'object',
                  properties: {
                    size: { type: 'number', example: 25 },
                  },
                },
              },
            },
          },
        },
      },
    },
  })
  async getMetrics(@Req() req: Request) {
    // 내부 전용 엔드포인트: IP 또는 API Key 기반 접근 제어
    assertMetricsAccess(req);

    const startTime = process.hrtime.bigint();

    const memoryStats = MemoryOptimizer.getMemoryStats();
    const memoryUsage = process.memoryUsage();
    const formatBytes = (bytes: number) => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(1)} MB`;
    };

    const loadAverage = process.cpuUsage();
    const cpuUsage = ((loadAverage.user + loadAverage.system) / 1000000) % 100;

    const poolStats = getPoolStats();

    let cacheStats;
    try {
      cacheStats = await Promise.race([
        this.cacheService.getStats(),
        new Promise(resolve => setTimeout(() => resolve({
          redis: { status: 'timeout' },
          fallback: { size: 0, keys: [] }
        }), 100))
      ]);
    } catch {
      cacheStats = {
        redis: { status: 'unavailable' },
        fallback: { size: 0, keys: [] }
      };
    }

    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1000000;

    return success({
      server: {
        uptime: process.uptime(),
        memory: {
          used: formatBytes(memoryUsage.rss),
          heap: formatBytes(memoryUsage.heapUsed),
          total: formatBytes(memoryUsage.heapTotal),
          external: formatBytes(memoryUsage.external),
          percentage: (memoryUsage.rss / memoryUsage.heapTotal) * 100,
          optimized: memoryStats,
        },
        cpu: {
          usage: cpuUsage,
          userTime: loadAverage.user,
          systemTime: loadAverage.system,
        },
        performance: {
          responseTimeMs: responseTimeMs.toFixed(2),
        },
      },
      database: {
        pool: poolStats || { message: 'Pool not initialized' },
        poolMonitor: this.poolMonitorService.getReport(),
      },
      cache: cacheStats,
      optimization: {
        compressionEnabled: true,
        keepAliveEnabled: true,
        memoryCacheEnabled: true,
        performanceMonitoringEnabled: true,
        smartCache: this.smartCacheService.getStats(),
        adaptiveCache: this.adaptiveCacheService.getStats(),
        apiOptimization: {
          total: 0,
          averageResponseTime: 0,
          slowQueries: [],
          cacheHitRate: 0,
          endpointStats: {}
        },
      },
      timestamp: new Date().toISOString(),
    });
  }
}
