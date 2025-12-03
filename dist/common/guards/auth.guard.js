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
const supabaseService_1 = require("../../services/supabaseService");
const mappers_1 = require("../../utils/mappers");
const sessionService_1 = require("../../services/sessionService");
const pool_1 = require("../../db/pool");
let AuthGuard = class AuthGuard {
    constructor(jwtTokenService, supabaseService, sessionService) {
        this.jwtTokenService = jwtTokenService;
        this.supabaseService = supabaseService;
        this.sessionService = sessionService;
        this.tokenCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5분 캐시
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
        const localUser = this.tryLocalJwt(token);
        if (localUser) {
            // 무한 토큰인지 확인 (exp 필드가 없는 경우)
            const isInfiniteToken = this.isInfiniteToken(token);
            if (!isInfiniteToken) {
                await this.ensureSessionActive(localUser.sessionId);
            }
            const hydratedUser = await this.hydrateUserRole(localUser.user);
            this.setCachedUser(token, hydratedUser);
            request.currentUser = hydratedUser;
            request.loginType = localUser.loginType;
            return true;
        }
        // 캐시된 사용자 확인
        const cachedUser = this.getCachedUser(token);
        if (cachedUser) {
            const hydratedUser = await this.hydrateUserRole(cachedUser);
            this.setCachedUser(token, hydratedUser);
            request.currentUser = hydratedUser;
            request.loginType = 'email';
            return true;
        }
        try {
            const supabaseUser = await this.supabaseService.getUserFromToken(token);
            if (supabaseUser?.email) {
                const userRecord = await this.hydrateUserRole((0, mappers_1.fromSupabaseUser)(supabaseUser));
                this.setCachedUser(token, userRecord);
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
            // 프로필이 없으면 자동 생성 (특히 테스트 사용자의 경우)
            if (!dbRole && user.id === 'e11cc73b-052d-4740-8213-999c05bfc332') {
                await pool.query(`INSERT INTO profiles (id, email, name, role, created_at, updated_at)
           VALUES ($1, $2, $3, $4, NOW(), NOW())
           ON CONFLICT (id) DO NOTHING`, [user.id, user.email, user.name, user.role ?? 'user']);
                const finalRole = user.role ?? 'user';
                this.roleCache.set(user.id, { role: finalRole, timestamp: Date.now() });
                return { ...user, role: finalRole };
            }
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
        supabaseService_1.SupabaseService,
        sessionService_1.SessionService])
], AuthGuard);
