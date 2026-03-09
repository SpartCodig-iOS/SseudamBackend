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
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const jwtService_1 = require("../../services/jwtService");
const enhanced_jwt_service_1 = require("../../services/enhanced-jwt.service");
const supabaseService_1 = require("../../services/supabaseService");
const mappers_1 = require("../../utils/mappers");
const sessionService_1 = require("../../services/sessionService");
const cacheService_1 = require("../../services/cacheService");
const crypto_1 = require("crypto");
const pool_1 = require("../../db/pool");
let AuthGuard = class AuthGuard {
    constructor(jwtTokenService, enhancedJwtService, supabaseService, sessionService, cacheService) {
        this.jwtTokenService = jwtTokenService;
        this.enhancedJwtService = enhancedJwtService;
        this.supabaseService = supabaseService;
        this.sessionService = sessionService;
        this.cacheService = cacheService;
        this.tokenCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5분 캐시
        this.REDIS_PREFIX = 'auth:token';
        this.REDIS_TTL_SECONDS = 5 * 60;
        // 역할 캐시 추가 (10분 TTL)
        this.roleCache = new Map();
        this.ROLE_CACHE_TTL = 10 * 60 * 1000; // 10분
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractBearer(request.headers.authorization);
        if (!token) {
            throw new common_1.UnauthorizedException('Missing bearer token');
        }
        // 🔐 Enhanced JWT 검증 (Blacklist 체크 포함)
        const enhancedUser = await this.tryEnhancedJwt(token);
        if (enhancedUser) {
            // Enhanced JWT로 검증 성공 (blacklist 체크 완료)
            this.setCachedUser(token, enhancedUser.user);
            void this.setRedisCachedUser(token, { user: enhancedUser.user, loginType: enhancedUser.loginType });
            request.currentUser = enhancedUser.user;
            request.loginType = enhancedUser.loginType;
            return true;
        }
        // ⚡ Fallback: 기존 JWT 검증 (Legacy)
        const localUser = this.tryLocalJwt(token);
        if (localUser) {
            // LIGHTNING-FAST: 모든 DB/세션 체크 스킵하고 JWT만으로 즉시 응답
            this.setCachedUser(token, localUser.user);
            void this.setRedisCachedUser(token, { user: localUser.user, loginType: localUser.loginType });
            request.currentUser = localUser.user;
            request.loginType = localUser.loginType;
            return true;
        }
        // Redis 캐시 확인 (프로세스 재시작 후에도 빠르게)
        const redisUser = await this.getRedisCachedUser(token);
        if (redisUser) {
            this.setCachedUser(token, redisUser.user);
            request.currentUser = redisUser.user;
            request.loginType = redisUser.loginType ?? 'email';
            return true;
        }
        // 캐시된 사용자 확인
        const cachedUser = this.getCachedUser(token);
        if (cachedUser) {
            // 🚀 ULTRA-FAST: 캐시된 사용자 즉시 사용 (DB 조회 스킵)
            request.currentUser = cachedUser;
            request.loginType = 'email';
            return true;
        }
        try {
            const supabaseUser = await this.supabaseService.getUserFromToken(token);
            if (supabaseUser?.email) {
                const userRecord = await this.hydrateUserRole((0, mappers_1.fromSupabaseUser)(supabaseUser));
                this.setCachedUser(token, userRecord);
                void this.setRedisCachedUser(token, { user: userRecord, loginType: 'email' });
                request.currentUser = userRecord;
                request.loginType = 'email';
                return true;
            }
        }
        catch (error) {
            // Swallow to throw generic unauthorized below
        }
        throw new common_1.UnauthorizedException('Unauthorized');
    }
    extractBearer(authHeader) {
        if (!authHeader)
            return null;
        const value = Array.isArray(authHeader) ? authHeader[0] : authHeader;
        const [scheme, token] = value.split(' ');
        if (scheme?.toLowerCase() !== 'bearer' || !token) {
            return null;
        }
        return token;
    }
    getCachedUser(token) {
        const cached = this.tokenCache.get(token);
        if (!cached)
            return null;
        const now = Date.now();
        if (now - cached.timestamp > this.CACHE_TTL) {
            this.tokenCache.delete(token);
            return null;
        }
        return cached.user;
    }
    getTokenCacheKey(token) {
        return (0, crypto_1.createHash)('sha256').update(token).digest('hex').slice(0, 32);
    }
    async getRedisCachedUser(token) {
        try {
            const key = this.getTokenCacheKey(token);
            return await this.cacheService.get(key, {
                prefix: this.REDIS_PREFIX,
            });
        }
        catch {
            return null;
        }
    }
    async setRedisCachedUser(token, payload) {
        try {
            const key = this.getTokenCacheKey(token);
            await this.cacheService.set(key, payload, {
                prefix: this.REDIS_PREFIX,
                ttl: this.REDIS_TTL_SECONDS,
            });
        }
        catch {
            // Redis 실패는 무시하고 계속
        }
    }
    setCachedUser(token, user) {
        this.tokenCache.set(token, {
            user,
            timestamp: Date.now(),
        });
        // 캐시 크기 제한 (1000개로 제한)
        if (this.tokenCache.size > 1000) {
            const firstKey = this.tokenCache.keys().next().value;
            if (firstKey) {
                this.tokenCache.delete(firstKey);
            }
        }
    }
    /**
     * Enhanced JWT 검증 (Blacklist 체크 포함)
     */
    async tryEnhancedJwt(token) {
        try {
            // Enhanced JWT 서비스로 검증 (blacklist 체크 포함)
            const payload = await this.enhancedJwtService.verifyAccessToken(token);
            if (payload?.sub && payload?.email && payload.sessionId) {
                const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date();
                const user = {
                    id: payload.sub,
                    email: payload.email,
                    name: payload.name ?? null,
                    avatar_url: null,
                    username: payload.email.split('@')[0] || payload.sub,
                    password_hash: '',
                    role: payload.role ?? 'user',
                    created_at: issuedAt,
                    updated_at: issuedAt,
                };
                return { user, loginType: payload.loginType, sessionId: payload.sessionId };
            }
            return null;
        }
        catch (error) {
            // Enhanced JWT 검증 실패 (blacklist에 있거나 유효하지 않은 토큰)
            return null;
        }
    }
    /**
     * 기존 JWT 검증 (Legacy, Blacklist 체크 없음)
     */
    tryLocalJwt(token) {
        try {
            const payload = this.jwtTokenService.verifyAccessToken(token);
            if (payload?.sub && payload?.email && payload.sessionId) {
                const issuedAt = payload.iat ? new Date(payload.iat * 1000) : new Date();
                const user = {
                    id: payload.sub,
                    email: payload.email,
                    name: payload.name ?? null,
                    avatar_url: null,
                    username: payload.email.split('@')[0] || payload.sub,
                    password_hash: '',
                    role: payload.role ?? 'user',
                    created_at: issuedAt,
                    updated_at: issuedAt,
                };
                return { user, loginType: payload.loginType, sessionId: payload.sessionId };
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    isInfiniteToken(token) {
        try {
            const payload = this.jwtTokenService.verifyAccessToken(token);
            // exp 필드가 없으면 무한 토큰으로 간주
            return !payload.exp;
        }
        catch (error) {
            return false;
        }
    }
    async ensureSessionActive(sessionId) {
        const session = await this.sessionService.getSession(sessionId);
        if (!session || !session.isActive) {
            throw new common_1.UnauthorizedException('Session expired or revoked');
        }
    }
    // 최신 role을 DB에서 확인해 요청 사용자에 반영 (재로그인 없이 즉시 반영)
    async hydrateUserRole(user) {
        // 🚀 ULTRA-FAST: 역할 캐시 확인
        const cached = this.roleCache.get(user.id);
        if (cached && (Date.now() - cached.timestamp < this.ROLE_CACHE_TTL)) {
            return { ...user, role: cached.role };
        }
        try {
            const pool = await (0, pool_1.getPool)();
            const result = await pool.query(`SELECT role FROM profiles WHERE id = $1 LIMIT 1`, [user.id]);
            const dbRole = result.rows[0]?.role;
            const finalRole = dbRole ?? user.role ?? 'user';
            // 역할을 캐시에 저장
            this.roleCache.set(user.id, { role: finalRole, timestamp: Date.now() });
            // 캐시 크기 제한
            if (this.roleCache.size > 500) {
                const firstKey = this.roleCache.keys().next().value;
                if (firstKey)
                    this.roleCache.delete(firstKey);
            }
            return { ...user, role: finalRole };
        }
        catch (error) {
            // DB 실패 시 기존 역할 유지
            return { ...user, role: user.role ?? 'user' };
        }
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [jwtService_1.JwtTokenService,
        enhanced_jwt_service_1.EnhancedJwtService,
        supabaseService_1.SupabaseService,
        sessionService_1.SessionService,
        cacheService_1.CacheService])
], AuthGuard);
