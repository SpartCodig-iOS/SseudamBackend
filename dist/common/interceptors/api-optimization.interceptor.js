"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ApiOptimizationInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiOptimizationInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let ApiOptimizationInterceptor = ApiOptimizationInterceptor_1 = class ApiOptimizationInterceptor {
    constructor() {
        this.logger = new common_1.Logger(ApiOptimizationInterceptor_1.name);
        this.metrics = [];
        this.MAX_METRICS = 1000; // 메모리 사용량 제한
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const startTime = process.hrtime.bigint();
        const method = request.method;
        const endpoint = this.normalizeEndpoint(request.route?.path || request.path);
        const userId = request.currentUser?.id;
        // 조건부 요청 지원 (ETag 기반)
        this.handleConditionalRequests(request, response);
        // 캐시 최적화 힌트
        this.addCacheOptimizationHints(request, response);
        return next.handle().pipe((0, operators_1.tap)((data) => {
            const endTime = process.hrtime.bigint();
            const responseTime = Number(endTime - startTime) / 1000000; // ms
            const handlerTime = response.get('X-Handler-Time');
            const dbTime = response.get('X-DB-Time');
            const cacheTime = response.get('X-Cache-Time');
            // 응답 시간 헤더 추가
            response.set('X-Response-Time', `${responseTime.toFixed(2)}ms`);
            // 캐시 히트 정보
            const cacheHit = response.get('X-Cache-Hit') === 'true';
            if (cacheHit) {
                response.set('X-Cache', 'HIT');
            }
            // 메트릭 수집
            this.collectMetrics({
                endpoint,
                method,
                responseTime,
                statusCode: response.statusCode,
                cacheHit,
                userId,
                timestamp: new Date().toISOString(),
            });
            // 느린 API 로깅
            if (responseTime > 1000) {
                this.logger.warn(`Slow API: ${method} ${endpoint} took ${responseTime.toFixed(2)}ms`, {
                    userId,
                    statusCode: response.statusCode,
                    handlerTime,
                    dbTime,
                    cacheTime,
                });
            }
            // 매우 빠른 응답은 캐시된 것일 가능성
            if (responseTime < 10 && !cacheHit) {
                response.set('X-Cache', 'LIKELY');
            }
        }), (0, operators_1.catchError)((error) => {
            const endTime = process.hrtime.bigint();
            const responseTime = Number(endTime - startTime) / 1000000;
            this.logger.error(`API Error: ${method} ${endpoint} failed after ${responseTime.toFixed(2)}ms`, {
                error: error.message,
                userId,
            });
            throw error;
        }));
    }
    normalizeEndpoint(path) {
        // 동적 경로를 정규화 (/api/v1/travels/123 -> /api/v1/travels/:id)
        return path
            .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
            .replace(/\/\d+/g, '/:id');
    }
    handleConditionalRequests(request, response) {
        const ifNoneMatch = request.get('If-None-Match');
        const ifModifiedSince = request.get('If-Modified-Since');
        // ETag 기반 조건부 요청
        if (ifNoneMatch) {
            const currentETag = response.get('ETag');
            if (currentETag && ifNoneMatch === currentETag) {
                response.status(304);
                return;
            }
        }
        // Last-Modified 기반 조건부 요청
        if (ifModifiedSince) {
            const lastModified = response.get('Last-Modified');
            if (lastModified && new Date(ifModifiedSince) >= new Date(lastModified)) {
                response.status(304);
                return;
            }
        }
    }
    addCacheOptimizationHints(request, response) {
        const method = request.method;
        const path = request.path;
        // GET 요청에 대한 캐시 힌트
        if (method === 'GET') {
            // 정적 데이터 (국가 목록, 환율 등)
            if (path.includes('/meta/')) {
                response.set({
                    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=7200', // 1시간
                    'Vary': 'Accept-Encoding',
                });
            }
            // 여행 목록 (자주 변경되지 않음)
            else if (path.includes('/travels') && !path.includes('/expenses')) {
                response.set({
                    'Cache-Control': 'private, max-age=300, stale-while-revalidate=600', // 5분
                    'Vary': 'Accept-Encoding, Authorization',
                });
            }
            // 비용 목록 (상대적으로 자주 변경)
            else if (path.includes('/expenses')) {
                response.set({
                    'Cache-Control': 'private, max-age=60, stale-while-revalidate=120', // 1분
                    'Vary': 'Accept-Encoding, Authorization',
                });
            }
            // 프로필 정보 (거의 변경되지 않음)
            else if (path.includes('/profile')) {
                response.set({
                    'Cache-Control': 'private, max-age=900, stale-while-revalidate=1800', // 15분
                    'Vary': 'Accept-Encoding, Authorization',
                });
            }
            // 기타 API
            else {
                response.set({
                    'Cache-Control': 'private, max-age=60', // 1분
                    'Vary': 'Accept-Encoding, Authorization',
                });
            }
        }
        // POST, PUT, DELETE 요청은 캐시 무효화
        else if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            response.set({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
            });
        }
    }
    collectMetrics(metric) {
        this.metrics.push(metric);
        // 메트릭 크기 제한
        if (this.metrics.length > this.MAX_METRICS) {
            this.metrics.splice(0, this.metrics.length - this.MAX_METRICS);
        }
    }
    // 성능 분석을 위한 메트릭 조회
    getApiMetrics() {
        if (this.metrics.length === 0) {
            return {
                total: 0,
                averageResponseTime: 0,
                slowQueries: [],
                cacheHitRate: 0,
                endpointStats: {},
            };
        }
        const totalResponseTime = this.metrics.reduce((sum, m) => sum + m.responseTime, 0);
        const averageResponseTime = totalResponseTime / this.metrics.length;
        const slowQueries = this.metrics
            .filter(m => m.responseTime > 500)
            .sort((a, b) => b.responseTime - a.responseTime)
            .slice(0, 10);
        const cacheHits = this.metrics.filter(m => m.cacheHit).length;
        const cacheHitRate = (cacheHits / this.metrics.length) * 100;
        // 엔드포인트별 통계
        const endpointStats = {};
        for (const metric of this.metrics) {
            const key = `${metric.method} ${metric.endpoint}`;
            if (!endpointStats[key]) {
                endpointStats[key] = {
                    count: 0,
                    avgResponseTime: 0,
                    cacheHitRate: 0,
                };
            }
            const stats = endpointStats[key];
            stats.count++;
            // 누적 평균 계산
            stats.avgResponseTime = ((stats.avgResponseTime * (stats.count - 1)) + metric.responseTime) / stats.count;
            // 캐시 히트율 계산
            const cacheHits = this.metrics
                .filter(m => m.method === metric.method && m.endpoint === metric.endpoint && m.cacheHit)
                .length;
            stats.cacheHitRate = (cacheHits / stats.count) * 100;
        }
        return {
            total: this.metrics.length,
            averageResponseTime: parseFloat(averageResponseTime.toFixed(2)),
            slowQueries,
            cacheHitRate: parseFloat(cacheHitRate.toFixed(2)),
            endpointStats,
        };
    }
    // 메트릭 초기화
    clearMetrics() {
        this.metrics.splice(0, this.metrics.length);
        this.logger.log('API metrics cleared');
    }
};
exports.ApiOptimizationInterceptor = ApiOptimizationInterceptor;
exports.ApiOptimizationInterceptor = ApiOptimizationInterceptor = ApiOptimizationInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], ApiOptimizationInterceptor);
