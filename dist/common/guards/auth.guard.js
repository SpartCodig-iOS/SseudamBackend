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
let AuthGuard = class AuthGuard {
    constructor(jwtTokenService, supabaseService, sessionService) {
        this.jwtTokenService = jwtTokenService;
        this.supabaseService = supabaseService;
        this.sessionService = sessionService;
        this.tokenCache = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5분 캐시
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const token = this.extractBearer(request.headers.authorization);
        if (!token) {
            throw new common_1.UnauthorizedException('Missing bearer token');
        }
        const localUser = this.tryLocalJwt(token);
        if (localUser) {
            await this.ensureSessionActive(localUser.sessionId);
            request.currentUser = localUser.user;
            request.loginType = localUser.loginType;
            return true;
        }
        // 캐시된 사용자 확인
        const cachedUser = this.getCachedUser(token);
        if (cachedUser) {
            request.currentUser = cachedUser;
            request.loginType = 'email';
            return true;
        }
        try {
            const supabaseUser = await this.supabaseService.getUserFromToken(token);
            if (supabaseUser?.email) {
                const userRecord = (0, mappers_1.fromSupabaseUser)(supabaseUser);
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
    async ensureSessionActive(sessionId) {
        const session = await this.sessionService.getSession(sessionId);
        if (!session || !session.isActive) {
            throw new common_1.UnauthorizedException('Session expired or revoked');
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
