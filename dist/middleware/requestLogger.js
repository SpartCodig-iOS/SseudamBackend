"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestLoggerMiddleware = void 0;
const common_1 = require("@nestjs/common");
const logger_1 = require("../utils/logger");
const toMilliseconds = (start) => {
    const diff = Number(process.hrtime.bigint() - start);
    return Math.round((diff / 1000000) * 100) / 100;
};
let RequestLoggerMiddleware = class RequestLoggerMiddleware {
    constructor() {
        this.excludedPaths = [
            '/health',
            '/health/database',
            '/health/supabase',
            '/favicon.ico',
            '/api-docs'
        ];
    }
    shouldSkipLogging(path) {
        return this.excludedPaths.some(excluded => path.startsWith(excluded));
    }
    use(req, res, next) {
        // 헬스체크 및 정적 파일 요청은 로깅 제외
        if (this.shouldSkipLogging(req.originalUrl)) {
            next();
            return;
        }
        const start = process.hrtime.bigint();
        logger_1.logger.debug('Request started', { method: req.method, path: req.originalUrl });
        res.on('finish', () => {
            const durationMs = toMilliseconds(start);
            const meta = {
                method: req.method,
                path: req.originalUrl,
                status: res.statusCode,
                durationMs,
            };
            if (res.statusCode >= 500) {
                logger_1.logger.error('Request failed', meta);
                return;
            }
            if (res.statusCode >= 400) {
                logger_1.logger.info('Request completed with client error', meta);
                return;
            }
            logger_1.logger.info('Request completed', meta);
        });
        next();
    }
};
exports.RequestLoggerMiddleware = RequestLoggerMiddleware;
exports.RequestLoggerMiddleware = RequestLoggerMiddleware = __decorate([
    (0, common_1.Injectable)()
], RequestLoggerMiddleware);
