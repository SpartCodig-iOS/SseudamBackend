"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_1 = require("../../types/api");
const supabaseService_1 = require("../../services/supabaseService");
const cacheService_1 = require("../../services/cacheService");
const pool_1 = require("../../db/pool");
const health_response_dto_1 = require("./dto/health-response.dto");
const memory_optimizer_1 = require("../../utils/memory-optimizer");
let HealthController = class HealthController {
    constructor(supabaseService, cacheService) {
        this.supabaseService = supabaseService;
        this.cacheService = cacheService;
    }
    async health() {
        const database = await this.supabaseService.checkProfilesHealth();
        return (0, api_1.success)({
            status: 'ok',
            database,
        });
    }
    async getMetrics() {
        const startTime = process.hrtime.bigint();
        // 최적화된 메모리 통계
        const memoryStats = memory_optimizer_1.MemoryOptimizer.getMemoryStats();
        const memoryUsage = process.memoryUsage();
        const formatBytes = (bytes) => {
            const mb = bytes / 1024 / 1024;
            return `${mb.toFixed(1)} MB`;
        };
        // CPU 사용량 (간단한 추정)
        const loadAverage = process.cpuUsage();
        const cpuUsage = ((loadAverage.user + loadAverage.system) / 1000000) % 100;
        // 데이터베이스 커넥션 풀 상태
        const poolStats = (0, pool_1.getPoolStats)();
        // 캐시 상태
        const cacheStats = await this.cacheService.getStats();
        const endTime = process.hrtime.bigint();
        const responseTimeMs = Number(endTime - startTime) / 1000000; // 나노초를 밀리초로 변환
        return (0, api_1.success)({
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
};
exports.HealthController = HealthController;
__decorate([
    (0, common_1.Get)('health'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '서버 및 데이터베이스 상태 확인' }),
    (0, swagger_1.ApiOkResponse)({ type: health_response_dto_1.HealthResponseDto }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "health", null);
__decorate([
    (0, common_1.Get)('metrics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '성능 메트릭 및 시스템 상태 확인' }),
    (0, swagger_1.ApiOkResponse)({
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
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "getMetrics", null);
exports.HealthController = HealthController = __decorate([
    (0, swagger_1.ApiTags)('Health'),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        cacheService_1.CacheService])
], HealthController);
