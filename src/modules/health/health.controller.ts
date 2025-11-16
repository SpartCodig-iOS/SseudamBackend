import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { SupabaseService } from '../../services/supabaseService';
import { CacheService } from '../../services/cacheService';
import { getPoolStats } from '../../db/pool';
import { HealthResponseDto } from './dto/health-response.dto';
import { MemoryOptimizer } from '../../utils/memory-optimizer';
import { SmartCacheService } from '../../services/smart-cache.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  private lastHealthCheck: { result: 'ok' | 'unavailable' | 'not_configured'; timestamp: number } | null = null;
  private readonly HEALTH_CACHE_TTL = 30 * 1000; // 30초 캐시

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheService: CacheService,
    private readonly smartCacheService: SmartCacheService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '서버 및 데이터베이스 상태 확인' })
  @ApiOkResponse({ type: HealthResponseDto })
  async health() {
    // 캐시된 헬스 체크 결과 사용 (30초 캐시)
    const now = Date.now();
    if (this.lastHealthCheck && (now - this.lastHealthCheck.timestamp) < this.HEALTH_CACHE_TTL) {
      return success({
        status: 'ok',
        database: this.lastHealthCheck.result,
      });
    }

    // 빠른 헬스 체크 (타임아웃 500ms)
    let database: 'ok' | 'unavailable' | 'not_configured';
    try {
      database = await Promise.race([
        this.supabaseService.checkProfilesHealth(),
        new Promise<'unavailable'>((resolve) =>
          setTimeout(() => resolve('unavailable'), 500)
        )
      ]);
    } catch (error) {
      database = 'unavailable';
    }

    // 결과 캐싱
    this.lastHealthCheck = { result: database, timestamp: now };

    return success({
      status: 'ok',
      database,
    });
  }

  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '성능 메트릭 및 시스템 상태 확인' })
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
  async getMetrics() {
    const startTime = process.hrtime.bigint();

    // 최적화된 메모리 통계
    const memoryStats = MemoryOptimizer.getMemoryStats();
    const memoryUsage = process.memoryUsage();
    const formatBytes = (bytes: number) => {
      const mb = bytes / 1024 / 1024;
      return `${mb.toFixed(1)} MB`;
    };

    // CPU 사용량 (간단한 추정)
    const loadAverage = process.cpuUsage();
    const cpuUsage = ((loadAverage.user + loadAverage.system) / 1000000) % 100;

    // 데이터베이스 커넥션 풀 상태
    const poolStats = getPoolStats();

    // 캐시 상태 (빠른 조회)
    let cacheStats;
    try {
      cacheStats = await Promise.race([
        this.cacheService.getStats(),
        new Promise(resolve => setTimeout(() => resolve({
          redis: { status: 'timeout' },
          fallback: { size: 0, keys: [] }
        }), 100))
      ]);
    } catch (error) {
      cacheStats = {
        redis: { status: 'unavailable' },
        fallback: { size: 0, keys: [] }
      };
    }

    const endTime = process.hrtime.bigint();
    const responseTimeMs = Number(endTime - startTime) / 1000000; // 나노초를 밀리초로 변환

    return success({
      server: {
        uptime: process.uptime(),
        memory: {
          used: formatBytes(memoryUsage.rss),
          heap: formatBytes(memoryUsage.heapUsed),
          total: formatBytes(memoryUsage.heapTotal),
          external: formatBytes(memoryUsage.external),
          percentage: (memoryUsage.rss / memoryUsage.heapTotal) * 100,
          optimized: memoryStats, // 최적화된 메모리 정보
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
      },
      cache: cacheStats,
      optimization: {
        compressionEnabled: true,
        keepAliveEnabled: true,
        memoryCacheEnabled: true,
        performanceMonitoringEnabled: true,
        smartCache: this.smartCacheService.getStats(),
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
