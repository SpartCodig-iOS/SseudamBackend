"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var PerformanceInterceptor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
let PerformanceInterceptor = PerformanceInterceptor_1 = class PerformanceInterceptor {
    constructor() {
        this.logger = new common_1.Logger(PerformanceInterceptor_1.name);
        this.warnThresholdMs = Number(process.env.PERF_WARN_MS ?? 300);
        this.errorThresholdMs = Number(process.env.PERF_ERROR_MS ?? 800);
        this.logSampleRate = Math.min(1, Math.max(0, Number(process.env.PERF_LOG_SAMPLE ?? 1)));
    }
    intercept(context, next) {
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const startTime = process.hrtime.bigint();
        // 요청 정보
        const method = request.method;
        const url = request.url;
        const userAgent = request.get('user-agent') || '';
        // Keep-Alive 및 캐싱 헤더 설정
        if (!response.headersSent) {
            response.set({
                'Connection': 'keep-alive',
                'Keep-Alive': 'timeout=5, max=1000',
                'X-Powered-By': 'Sseduam-API',
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'DENY',
                'X-XSS-Protection': '1; mode=block',
            });
        }
        // API 응답에 따른 캐싱 헤더 설정
        if (method === 'GET' && !response.headersSent) {
            const cacheableEndpoints = [
                '/api/v1/meta/countries',
                '/api/v1/meta/exchange-rate',
                '/health',
                '/metrics',
            ];
            const isCacheable = cacheableEndpoints.some(endpoint => url.includes(endpoint));
            if (isCacheable) {
                response.set({
                    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
                    'ETag': `W/"${Date.now()}"`,
                });
            }
            else {
                response.set({
                    'Cache-Control': 'private, no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                });
            }
        }
        return next.handle().pipe((0, operators_1.tap)((data) => {
            const endTime = process.hrtime.bigint();
            const duration = Number(endTime - startTime) / 1000000; // ms
            if (!response.headersSent) {
                response.set({
                    'X-Response-Time': `${duration.toFixed(2)}ms`,
                    'X-Request-ID': `req_${startTime}`,
                });
            }
            const shouldLog = Math.random() <= this.logSampleRate;
            if (duration > this.warnThresholdMs && shouldLog) {
                this.logger.warn('Slow request detected', {
                    method,
                    url,
                    duration: `${duration.toFixed(2)}ms`,
                    userAgent: userAgent.substring(0, 100),
                    timestamp: new Date().toISOString(),
                });
            }
            if (duration > this.errorThresholdMs && shouldLog) {
                const responseSize = data ? Buffer.byteLength(JSON.stringify(data), 'utf8') : 0;
                const handlerTime = request.get('X-Handler-Time');
                const dbTime = request.get('X-DB-Time');
                const cacheTime = request.get('X-Cache-Time');
                this.logger.error('Very slow request', {
                    method,
                    url,
                    duration: `${duration.toFixed(2)}ms`,
                    userAgent,
                    responseSize,
                    handlerTime,
                    dbTime,
                    cacheTime,
                    timestamp: new Date().toISOString(),
                });
            }
        }));
    }
};
exports.PerformanceInterceptor = PerformanceInterceptor;
exports.PerformanceInterceptor = PerformanceInterceptor = PerformanceInterceptor_1 = __decorate([
    (0, common_1.Injectable)()
], PerformanceInterceptor);
