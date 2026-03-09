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
var GatewayService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayService = void 0;
const common_1 = require("@nestjs/common");
const enhanced_jwt_service_1 = require("../../services/enhanced-jwt.service");
const rateLimitService_1 = require("../../services/rateLimitService");
const cacheService_1 = require("../../services/cacheService");
let GatewayService = GatewayService_1 = class GatewayService {
    constructor(jwtService, rateLimitService, cacheService) {
        this.jwtService = jwtService;
        this.rateLimitService = rateLimitService;
        this.cacheService = cacheService;
        this.logger = new common_1.Logger(GatewayService_1.name);
        // 라우트 설정 (실제로는 DB나 설정 파일에서 로드)
        this.routeConfigs = [
            // 공개 엔드포인트
            {
                path: '/api/v1/health',
                methods: ['GET'],
                auth: 'none',
                rateLimit: { windowMs: 60000, maxRequests: 100 }
            },
            {
                path: '/api/v1/auth/login',
                methods: ['POST'],
                auth: 'none',
                rateLimit: {
                    windowMs: 900000, // 15분
                    maxRequests: 5, // 로그인 시도 제한
                    keyGenerator: (req) => `login:${req.ip}:${JSON.stringify(req.body)?.substring(0, 50)}`
                }
            },
            {
                path: '/api/v1/auth/signup',
                methods: ['POST'],
                auth: 'none',
                rateLimit: { windowMs: 3600000, maxRequests: 3 } // 1시간에 3번
            },
            // 인증 필요 엔드포인트
            {
                path: '/api/v1/auth/logout',
                methods: ['POST'],
                auth: 'required',
                rateLimit: { windowMs: 60000, maxRequests: 10 }
            },
            {
                path: '/api/v1/auth/refresh',
                methods: ['POST'],
                auth: 'required',
                rateLimit: { windowMs: 60000, maxRequests: 20 }
            },
            // 사용자 프로필
            {
                path: '/api/v1/profile',
                methods: ['GET', 'PUT'],
                auth: 'required',
                rateLimit: { windowMs: 60000, maxRequests: 30 }
            },
            // 여행 관련 (일반 사용자)
            {
                path: '/api/v1/travels',
                methods: ['GET', 'POST'],
                auth: 'required',
                rateLimit: { windowMs: 60000, maxRequests: 50 }
            },
            {
                path: '/api/v1/travels/:id',
                methods: ['GET', 'PUT', 'DELETE'],
                auth: 'required',
                rateLimit: { windowMs: 60000, maxRequests: 30 }
            },
            // 관리자 전용
            {
                path: '/api/v1/users',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                auth: 'required',
                roles: ['admin', 'super_admin'],
                rateLimit: { windowMs: 60000, maxRequests: 100 }
            },
            {
                path: '/api/v1/admin',
                methods: ['GET', 'POST', 'PUT', 'DELETE'],
                auth: 'required',
                roles: ['super_admin'],
                rateLimit: { windowMs: 60000, maxRequests: 50 }
            },
            // 개발 전용 (개발 환경에서만)
            {
                path: '/api/v1/dev',
                methods: ['GET', 'POST'],
                auth: 'required',
                roles: ['super_admin'],
                rateLimit: { windowMs: 60000, maxRequests: 10 }
            },
        ];
    }
    /**
     * 메인 게이트웨이 검증 함수
     */
    async validateRequest(request) {
        const startTime = Date.now();
        try {
            // 1. 라우트 설정 찾기
            const routeConfig = this.findRouteConfig(request.path, request.method);
            if (!routeConfig) {
                return {
                    allowed: false,
                    reason: 'Route not found or method not allowed'
                };
            }
            // 2. Rate Limiting 검사
            const rateLimitResult = await this.checkRateLimit(request, routeConfig);
            if (!rateLimitResult.allowed) {
                return rateLimitResult;
            }
            // 3. 인증 검사
            const authResult = await this.checkAuthentication(request, routeConfig);
            if (!authResult.allowed) {
                return authResult;
            }
            // 4. 권한 검사
            const authzResult = await this.checkAuthorization(authResult.user, routeConfig);
            if (!authzResult.allowed) {
                return authzResult;
            }
            // 5. 추가 보안 검사
            const securityResult = await this.performSecurityChecks(request, authResult.user);
            if (!securityResult.allowed) {
                return securityResult;
            }
            const duration = Date.now() - startTime;
            this.logger.debug(`Gateway validation completed in ${duration}ms for ${request.method} ${request.path}`);
            return {
                allowed: true,
                user: authResult.user,
                rateLimitInfo: rateLimitResult.rateLimitInfo,
            };
        }
        catch (error) {
            this.logger.error(`Gateway validation error for ${request.method} ${request.path}:`, error);
            return {
                allowed: false,
                reason: 'Internal gateway error'
            };
        }
    }
    /**
     * 라우트 설정 찾기 (경로 매칭)
     */
    findRouteConfig(path, method) {
        for (const config of this.routeConfigs) {
            if (this.matchPath(config.path, path) && config.methods.includes(method.toUpperCase())) {
                return config;
            }
        }
        return null;
    }
    /**
     * 경로 매칭 (동적 파라미터 지원)
     */
    matchPath(configPath, requestPath) {
        // 간단한 구현 - 실제로는 더 정교한 패턴 매칭 필요
        const configParts = configPath.split('/');
        const requestParts = requestPath.split('/');
        if (configParts.length !== requestParts.length) {
            return false;
        }
        for (let i = 0; i < configParts.length; i++) {
            const configPart = configParts[i];
            const requestPart = requestParts[i];
            // 동적 파라미터 (:id 형태)
            if (configPart.startsWith(':')) {
                continue;
            }
            // 정확한 매칭 필요
            if (configPart !== requestPart) {
                return false;
            }
        }
        return true;
    }
    /**
     * Rate Limiting 검사
     */
    async checkRateLimit(request, config) {
        if (!config.rateLimit) {
            return { allowed: true };
        }
        try {
            const key = config.rateLimit.keyGenerator
                ? config.rateLimit.keyGenerator(request)
                : `rate_limit:${request.ip}:${request.path}`;
            const result = await this.rateLimitService.checkLimit(key, config.rateLimit.maxRequests, config.rateLimit.windowMs);
            if (!result.allowed) {
                this.logger.warn(`Rate limit exceeded for ${request.ip} on ${request.path}`);
                return {
                    allowed: false,
                    reason: 'Rate limit exceeded',
                    rateLimitInfo: {
                        remaining: 0,
                        resetTime: Date.now() + config.rateLimit.windowMs,
                    }
                };
            }
            return {
                allowed: true,
                rateLimitInfo: {
                    remaining: result.remaining,
                    resetTime: Date.now() + config.rateLimit.windowMs,
                }
            };
        }
        catch (error) {
            this.logger.error(`Rate limit check error:`, error);
            return { allowed: true }; // 에러 시 허용 (가용성 우선)
        }
    }
    /**
     * 인증 검사
     */
    async checkAuthentication(request, config) {
        if (config.auth === 'none') {
            return { allowed: true };
        }
        const authHeader = request.headers['authorization'] || request.headers['Authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            if (config.auth === 'required') {
                return {
                    allowed: false,
                    reason: 'Missing or invalid authorization header'
                };
            }
            return { allowed: true }; // optional auth
        }
        const token = authHeader.substring(7); // Remove 'Bearer '
        try {
            const payload = await this.jwtService.verifyAccessToken(token);
            if (!payload) {
                return {
                    allowed: false,
                    reason: 'Invalid or expired token'
                };
            }
            return {
                allowed: true,
                user: {
                    id: payload.sub,
                    email: payload.email,
                    name: payload.name,
                    role: payload.role,
                    sessionId: payload.sessionId,
                    tokenId: payload.tokenId,
                }
            };
        }
        catch (error) {
            this.logger.debug(`Token verification failed: ${error instanceof Error ? error.message : String(error)}`);
            return {
                allowed: false,
                reason: 'Token verification failed'
            };
        }
    }
    /**
     * 권한 검사 (Role-based)
     */
    async checkAuthorization(user, config) {
        if (!config.roles || config.roles.length === 0) {
            return { allowed: true };
        }
        if (!config.roles.includes(user.role)) {
            this.logger.warn(`Access denied for user ${user.id} (${user.role}) to ${config.path}`);
            return {
                allowed: false,
                reason: `Insufficient privileges. Required roles: ${config.roles.join(', ')}`
            };
        }
        return { allowed: true };
    }
    /**
     * 추가 보안 검사
     */
    async performSecurityChecks(request, user) {
        // 1. 의심스러운 IP 체크
        if (await this.isSuspiciousIP(request.ip)) {
            this.logger.warn(`Suspicious IP detected: ${request.ip}`);
            return {
                allowed: false,
                reason: 'Request from suspicious IP address'
            };
        }
        // 2. 계정 잠금 체크
        if (user && await this.isAccountLocked(user.id)) {
            this.logger.warn(`Locked account access attempt: ${user.id}`);
            return {
                allowed: false,
                reason: 'Account is temporarily locked'
            };
        }
        // 3. 비정상적인 요청 패턴 체크
        if (await this.detectAnomalousRequest(request, user)) {
            this.logger.warn(`Anomalous request pattern detected for ${user?.id || request.ip}`);
            return {
                allowed: false,
                reason: 'Anomalous request pattern detected'
            };
        }
        return { allowed: true };
    }
    /**
     * 의심스러운 IP 검사
     */
    async isSuspiciousIP(ip) {
        try {
            const key = `suspicious_ip:${ip}`;
            const result = await this.cacheService.get(key);
            return result === true;
        }
        catch {
            return false;
        }
    }
    /**
     * 계정 잠금 상태 확인
     */
    async isAccountLocked(userId) {
        try {
            const key = `locked_account:${userId}`;
            const result = await this.cacheService.get(key);
            return result === true;
        }
        catch {
            return false;
        }
    }
    /**
     * 비정상적인 요청 패턴 감지
     */
    async detectAnomalousRequest(request, user) {
        // 간단한 구현 - 실제로는 더 정교한 ML 기반 분석 가능
        try {
            const key = user ? `request_pattern:user:${user.id}` : `request_pattern:ip:${request.ip}`;
            // 최근 5분간 요청 패턴 체크
            const recentRequests = await this.cacheService.get(key) || [];
            const now = Date.now();
            const fiveMinutesAgo = now - 5 * 60 * 1000;
            // 5분간 요청 기록 필터링
            const recentValidRequests = recentRequests.filter(timestamp => parseInt(timestamp) > fiveMinutesAgo);
            // 새 요청 추가
            recentValidRequests.push(now.toString());
            // 캐시 업데이트
            await this.cacheService.set(key, recentValidRequests, { ttl: 300 }); // 5분
            // 5분간 100회 이상 요청 시 의심스러운 것으로 판단
            return recentValidRequests.length > 100;
        }
        catch {
            return false;
        }
    }
    /**
     * 게이트웨이 통계 조회
     */
    async getGatewayStats() {
        // 구현 생략 - 실제로는 Redis나 별도 저장소에서 통계 수집
        return {
            totalRequests: 0,
            blockedRequests: 0,
            topBlockReasons: {},
            rateLimitHits: 0,
            authFailures: 0,
        };
    }
    /**
     * IP를 의심스러운 목록에 추가
     */
    async addSuspiciousIP(ip, reason, ttlSeconds = 3600) {
        try {
            const key = `suspicious_ip:${ip}`;
            await this.cacheService.set(key, true, { ttl: ttlSeconds });
            this.logger.warn(`IP ${ip} added to suspicious list: ${reason}`);
        }
        catch (error) {
            this.logger.error(`Failed to add suspicious IP ${ip}:`, error);
        }
    }
    /**
     * 계정 잠금
     */
    async lockAccount(userId, reason, ttlSeconds = 1800) {
        try {
            const key = `locked_account:${userId}`;
            await this.cacheService.set(key, true, { ttl: ttlSeconds });
            this.logger.warn(`Account ${userId} locked: ${reason}`);
        }
        catch (error) {
            this.logger.error(`Failed to lock account ${userId}:`, error);
        }
    }
};
exports.GatewayService = GatewayService;
exports.GatewayService = GatewayService = GatewayService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [enhanced_jwt_service_1.EnhancedJwtService,
        rateLimitService_1.RateLimitService,
        cacheService_1.CacheService])
], GatewayService);
