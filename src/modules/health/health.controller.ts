import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { success } from '../../types/api';
import { SupabaseService } from '../../services/supabaseService';
import { CacheService } from '../../services/cacheService';
import { getPoolStats } from '../../db/pool';
import { HealthResponseDto } from './dto/health-response.dto';
import { MemoryOptimizer } from '../../utils/memory-optimizer';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheService: CacheService,
  ) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '서버 및 데이터베이스 상태 확인' })
  @ApiOkResponse({ type: HealthResponseDto })
  async health() {
    const database = await this.supabaseService.checkProfilesHealth();

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

    // 캐시 상태
    const cacheStats = await this.cacheService.getStats();

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
      },
      timestamp: new Date().toISOString(),
    });
  }
}
