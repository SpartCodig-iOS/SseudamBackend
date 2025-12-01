"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseTransformInterceptor = void 0;
const common_1 = require("@nestjs/common");
const operators_1 = require("rxjs/operators");
const PRESERVE_NULL_KEYS = new Set(['avatarURL']);
let ResponseTransformInterceptor = class ResponseTransformInterceptor {
    intercept(context, next) {
        const response = context.switchToHttp().getResponse();
        const request = context.switchToHttp().getRequest();
        return next.handle().pipe((0, operators_1.map)((data) => {
            // 이미 변환된 응답은 그대로 반환
            if (data && typeof data === 'object' && data.code !== undefined) {
                return this.optimizeResponse(data, response, request);
            }
            // Raw 데이터를 표준 형식으로 변환
            const transformedResponse = {
                code: 200,
                message: 'Success',
                data: data || {},
                meta: {
                    timestamp: new Date().toISOString(),
                    requestId: response.get('X-Request-ID'),
                },
            };
            return this.optimizeResponse(transformedResponse, response, request);
        }));
    }
    optimizeResponse(data, response, request) {
        // 메타 정보 추가
        if (data && typeof data === 'object') {
            data.meta = {
                ...data.meta,
                responseTime: response.get('X-Response-Time'),
                requestId: response.get('X-Request-ID'),
                cached: !!response.get('X-Cache-Hit'),
            };
            // 민감한 정보 제거 (production 환경에서)
            if (process.env.NODE_ENV === 'production') {
                this.sanitizeResponse(data);
            }
            // 페이지네이션이 있는 응답에 대한 최적화
            if (Array.isArray(data.data)) {
                data.meta = {
                    ...data.meta,
                    count: data.data.length,
                };
                // 큰 배열에 대한 압축 힌트
                if (data.data.length > 50) {
                    response.set('X-Large-Response', 'true');
                }
            }
            // 빈 객체나 배열 최적화
            if (data.data && typeof data.data === 'object') {
                data.data = this.compactObject(data.data);
            }
        }
        return data;
    }
    sanitizeResponse(data) {
        // 스택 트레이스나 내부 정보 제거
        if (data.error) {
            delete data.error.stack;
            delete data.error.sql;
        }
        // 디버그 정보 제거
        if (data.debug) {
            delete data.debug;
        }
    }
    compactObject(obj) {
        if (Array.isArray(obj)) {
            return obj.map(item => this.compactObject(item));
        }
        if (obj && typeof obj === 'object') {
            const compacted = {};
            for (const [key, value] of Object.entries(obj)) {
                // null, undefined, 빈 문자열 제거
                if (PRESERVE_NULL_KEYS.has(key)) {
                    compacted[key] = value === undefined ? null : value;
                    continue;
                }
                if (value !== null && value !== undefined && value !== '') {
                    compacted[key] = this.compactObject(value);
                }
            }
            return compacted;
        }
        return obj;
    }
};
exports.ResponseTransformInterceptor = ResponseTransformInterceptor;
exports.ResponseTransformInterceptor = ResponseTransformInterceptor = __decorate([
    (0, common_1.Injectable)()
], ResponseTransformInterceptor);
