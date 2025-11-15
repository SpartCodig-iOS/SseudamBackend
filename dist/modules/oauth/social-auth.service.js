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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var SocialAuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialAuthService = void 0;
const node_crypto_1 = require("node:crypto");
const common_1 = require("@nestjs/common");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supabaseService_1 = require("../../services/supabaseService");
const cacheService_1 = require("../../services/cacheService");
const auth_service_1 = require("../auth/auth.service");
const mappers_1 = require("../../utils/mappers");
const env_1 = require("../../config/env");
let SocialAuthService = SocialAuthService_1 = class SocialAuthService {
    constructor(supabaseService, cacheService, authService) {
        this.supabaseService = supabaseService;
        this.cacheService = cacheService;
        this.authService = authService;
        this.logger = new common_1.Logger(SocialAuthService_1.name);
        // Apple JWT 토큰 캐싱 (10분 TTL)
        this.appleClientSecretCache = null;
        // OAuth 토큰 교환 요청 캐싱 (중복 요청 방지)
        this.tokenExchangePromises = new Map();
        this.OAUTH_USER_CACHE_TTL_SECONDS = 5 * 60;
        this.OAUTH_TOKEN_CACHE_PREFIX = 'oauth:token';
        this.OAUTH_USER_INDEX_PREFIX = 'oauth:user-index';
        this.OAUTH_USER_INDEX_TTL_SECONDS = 60 * 30; // 30분
        this.OAUTH_USER_INDEX_LIMIT = 12;
        // 네트워크 타임아웃 설정 (빠른 실패)
        this.NETWORK_TIMEOUT = 8000; // 8초
    }
    ensureAppleEnv() {
        if (!env_1.env.appleClientId || !env_1.env.appleTeamId || !env_1.env.appleKeyId || !env_1.env.applePrivateKey) {
            throw new common_1.ServiceUnavailableException('Apple credentials are not configured');
        }
    }
    ensureGoogleEnv() {
        if (!env_1.env.googleClientId || !env_1.env.googleClientSecret) {
            throw new common_1.ServiceUnavailableException('Google credentials are not configured');
        }
    }
    getTokenCacheKey(accessToken) {
        return (0, node_crypto_1.createHash)('sha256').update(accessToken).digest('hex');
    }
    // Redis 기반 OAuth 사용자 캐시 (fallback으로 내부 CacheService 메모리 캐시 사용)
    async getCachedOAuthUser(accessToken) {
        const cacheKey = this.getTokenCacheKey(accessToken);
        const cached = await this.cacheService.get(cacheKey, {
            prefix: this.OAUTH_TOKEN_CACHE_PREFIX,
        });
        return cached ?? null;
    }
    async setCachedOAuthUser(accessToken, user) {
        const cacheKey = this.getTokenCacheKey(accessToken);
        await this.cacheService.set(cacheKey, user, {
            prefix: this.OAUTH_TOKEN_CACHE_PREFIX,
            ttl: this.OAUTH_USER_CACHE_TTL_SECONDS,
        });
        await this.trackTokenCacheKey(user.id, cacheKey);
    }
    async trackTokenCacheKey(userId, tokenKey) {
        const existing = (await this.cacheService.get(userId, {
            prefix: this.OAUTH_USER_INDEX_PREFIX,
        })) ?? [];
        const deduped = [tokenKey, ...existing.filter((key) => key !== tokenKey)].slice(0, this.OAUTH_USER_INDEX_LIMIT);
        await this.cacheService.set(userId, deduped, {
            prefix: this.OAUTH_USER_INDEX_PREFIX,
            ttl: this.OAUTH_USER_INDEX_TTL_SECONDS,
        });
    }
    async invalidateOAuthCacheByUser(userId) {
        const tokenKeys = (await this.cacheService.get(userId, {
            prefix: this.OAUTH_USER_INDEX_PREFIX,
        })) ?? [];
        if (tokenKeys.length > 0) {
            await Promise.all(tokenKeys.map((tokenKey) => this.cacheService.del(tokenKey, { prefix: this.OAUTH_TOKEN_CACHE_PREFIX })));
        }
        await this.cacheService.del(userId, { prefix: this.OAUTH_USER_INDEX_PREFIX });
    }
    buildAppleClientSecret() {
        // 캐시된 토큰이 있고 아직 유효하면 재사용
        if (this.appleClientSecretCache && this.appleClientSecretCache.expiresAt > Date.now()) {
            return this.appleClientSecretCache.token;
        }
        this.ensureAppleEnv();
        const privateKey = env_1.env.applePrivateKey.replace(/\\n/g, '\n');
        const now = Math.floor(Date.now() / 1000);
        const token = jsonwebtoken_1.default.sign({
            iss: env_1.env.appleTeamId,
            iat: now,
            exp: now + 60 * 10, // 10분 만료
            aud: 'https://appleid.apple.com',
            sub: env_1.env.appleClientId,
        }, privateKey, {
            algorithm: 'ES256',
            keyid: env_1.env.appleKeyId,
        });
        // 캐시에 저장 (9분 후 만료로 설정하여 여유 시간 확보)
        this.appleClientSecretCache = {
            token,
            expiresAt: Date.now() + (9 * 60 * 1000)
        };
        return token;
    }
    // 네트워크 요청 헬퍼 (타임아웃 포함)
    async fetchWithTimeout(url, options) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.NETWORK_TIMEOUT);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'User-Agent': 'SseudamBackend/1.0.0',
                    ...options.headers,
                }
            });
            clearTimeout(timeoutId);
            return response;
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === 'AbortError') {
                throw new common_1.ServiceUnavailableException('OAuth request timeout');
            }
            throw error;
        }
    }
    async loginWithOAuthToken(accessToken, loginType = 'email', options = {}) {
        const startTime = Date.now();
        if (!accessToken) {
            throw new common_1.UnauthorizedException('Missing Supabase access token');
        }
        // 캐시된 사용자 정보 확인 (초고속)
        const cachedUser = await this.getCachedOAuthUser(accessToken);
        if (cachedUser) {
            this.logger.debug(`OAuth user cache hit for token ${accessToken.substring(0, 10)}...`);
            // 캐시된 사용자로 바로 세션 생성 (병렬 처리)
            const authSession = await this.authService.createAuthSession(cachedUser, loginType);
            const duration = Date.now() - startTime;
            this.logger.debug(`Ultra-fast OAuth login completed in ${duration}ms (cache hit)`);
            return authSession;
        }
        // 캐시 미스: 사용자 정보 조회 및 프로필 생성을 병렬 처리
        const [supabaseUser] = await Promise.all([
            this.supabaseService.getUserFromToken(accessToken)
        ]);
        if (!supabaseUser) {
            throw new common_1.UnauthorizedException('Invalid Supabase access token');
        }
        // 프로필 생성과 토큰 교환을 병렬로 처리
        const { appleRefreshToken, googleRefreshToken, authorizationCode, codeVerifier, redirectUri } = options;
        const tasks = [
            this.supabaseService.ensureProfileFromSupabaseUser(supabaseUser, loginType)
        ];
        // 토큰 교환 작업들을 병렬로 추가
        let appleTokenPromise = Promise.resolve(appleRefreshToken || null);
        let googleTokenPromise = Promise.resolve(googleRefreshToken || null);
        if (loginType === 'apple' && !appleRefreshToken && authorizationCode) {
            appleTokenPromise = this.exchangeAppleAuthorizationCode(authorizationCode);
        }
        if (loginType === 'google' && !googleRefreshToken && authorizationCode) {
            googleTokenPromise = this.exchangeGoogleAuthorizationCode(authorizationCode, {
                codeVerifier,
                redirectUri,
            });
        }
        // 모든 비동기 작업을 병렬로 실행
        const [, finalAppleRefreshToken, finalGoogleRefreshToken] = await Promise.all([
            ...tasks,
            appleTokenPromise,
            googleTokenPromise
        ]);
        const preferDisplayName = loginType !== 'email' && loginType !== 'username';
        const user = (0, mappers_1.fromSupabaseUser)(supabaseUser, { preferDisplayName });
        // 사용자 정보를 캐시에 저장 (다음 로그인 최적화)
        await this.setCachedOAuthUser(accessToken, user);
        // 토큰 저장 작업도 병렬로 처리
        const saveTokenTasks = [];
        if (loginType === 'apple' && finalAppleRefreshToken) {
            saveTokenTasks.push(this.supabaseService.saveAppleRefreshToken(user.id, finalAppleRefreshToken));
        }
        if (loginType === 'google' && finalGoogleRefreshToken) {
            saveTokenTasks.push(this.supabaseService.saveGoogleRefreshToken(user.id, finalGoogleRefreshToken));
        }
        // 토큰 저장과 세션 생성을 병렬로 처리
        const [authSession] = await Promise.all([
            this.authService.createAuthSession(user, loginType),
            ...saveTokenTasks
        ]);
        const duration = Date.now() - startTime;
        this.logger.debug(`OAuth login completed in ${duration}ms for ${user.email}`);
        return authSession;
    }
    async checkOAuthAccount(accessToken, loginType = 'email') {
        if (!accessToken) {
            throw new common_1.UnauthorizedException('Missing Supabase access token');
        }
        const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
        if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
            throw new common_1.UnauthorizedException('Invalid Supabase access token');
        }
        const profile = await this.supabaseService.findProfileById(supabaseUser.id);
        return { registered: Boolean(profile) };
    }
    async revokeAppleConnection(userId, refreshToken) {
        try {
            const tokenToUse = refreshToken ??
                (await this.supabaseService.getAppleRefreshToken(userId)) ??
                null;
            if (!tokenToUse) {
                this.logger.warn(`[revokeAppleConnection] No Apple refresh token found for user ${userId}, skipping revoke`);
                return; // 토큰이 없으면 조용히 종료 (이미 연결 해제된 상태)
            }
            this.ensureAppleEnv();
            const clientSecret = this.buildAppleClientSecret();
            const body = new URLSearchParams({
                token: tokenToUse,
                token_type_hint: 'refresh_token',
                client_id: env_1.env.appleClientId,
                client_secret: clientSecret,
            });
            // 타임아웃 추가 (8초)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const response = await fetch('https://appleid.apple.com/auth/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const text = await response.text();
                this.logger.warn(`[revokeAppleConnection] Apple revoke failed: ${response.status} ${text}`);
                // 계정 삭제 시에는 Apple 연결 해제 실패해도 계속 진행
                return;
            }
            // 성공 시에만 토큰 삭제
            await this.supabaseService.saveAppleRefreshToken(userId, null);
            await this.invalidateOAuthCacheByUser(userId);
            this.logger.debug(`[revokeAppleConnection] Successfully revoked Apple connection for user ${userId}`);
        }
        catch (error) {
            // Apple 연결 해제 실패는 로그만 남기고 계정 삭제는 계속 진행
            this.logger.warn(`[revokeAppleConnection] Failed to revoke Apple connection for user ${userId}:`, error);
            return;
        }
    }
    async revokeGoogleConnection(userId, refreshToken) {
        try {
            const tokenToUse = refreshToken ??
                (await this.supabaseService.getGoogleRefreshToken(userId)) ??
                null;
            if (!tokenToUse) {
                this.logger.warn(`[revokeGoogleConnection] No Google refresh token found for user ${userId}, skipping revoke`);
                return; // 토큰이 없으면 조용히 종료 (이미 연결 해제된 상태)
            }
            this.ensureGoogleEnv();
            const body = new URLSearchParams({
                token: tokenToUse,
                client_id: env_1.env.googleClientId,
                client_secret: env_1.env.googleClientSecret,
            });
            // 타임아웃 추가 (8초)
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const response = await fetch('https://oauth2.googleapis.com/revoke', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            if (!response.ok) {
                const text = await response.text();
                this.logger.warn(`[revokeGoogleConnection] Google revoke failed: ${response.status} ${text}`);
                // 계정 삭제 시에는 Google 연결 해제 실패해도 계속 진행
                return;
            }
            // 성공 시에만 토큰 삭제
            await this.supabaseService.saveGoogleRefreshToken(userId, null);
            await this.invalidateOAuthCacheByUser(userId);
            this.logger.debug(`[revokeGoogleConnection] Successfully revoked Google connection for user ${userId}`);
        }
        catch (error) {
            // Google 연결 해제 실패는 로그만 남기고 계정 삭제는 계속 진행
            this.logger.warn(`[revokeGoogleConnection] Failed to revoke Google connection for user ${userId}:`, error);
            return;
        }
    }
    resolveGoogleRedirectUri(override) {
        const resolved = override ?? env_1.env.googleRedirectUri;
        if (!resolved) {
            throw new common_1.ServiceUnavailableException('Google redirect URI is not configured');
        }
        return resolved;
    }
    async exchangeAppleAuthorizationCode(code) {
        const cacheKey = `apple-${code}`;
        // 중복 요청 방지: 동일한 코드로 진행 중인 요청이 있으면 재사용
        const existingPromise = this.tokenExchangePromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }
        const exchangePromise = this._exchangeAppleAuthorizationCode(code);
        this.tokenExchangePromises.set(cacheKey, exchangePromise);
        try {
            const result = await exchangePromise;
            return result;
        }
        finally {
            // 요청 완료 후 캐시에서 제거
            this.tokenExchangePromises.delete(cacheKey);
        }
    }
    async _exchangeAppleAuthorizationCode(code) {
        this.ensureAppleEnv();
        const clientSecret = this.buildAppleClientSecret();
        const body = new URLSearchParams({
            client_id: env_1.env.appleClientId,
            client_secret: clientSecret,
            code,
            grant_type: 'authorization_code',
        });
        const response = await this.fetchWithTimeout('https://appleid.apple.com/auth/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new common_1.ServiceUnavailableException(`Apple token exchange failed: ${response.status} ${text}`);
        }
        const result = (await response.json());
        if (!result.refresh_token) {
            throw new common_1.ServiceUnavailableException('Apple did not return a refresh_token');
        }
        return result.refresh_token;
    }
    async exchangeGoogleAuthorizationCode(code, options = {}) {
        const cacheKey = `google-${code}-${options.codeVerifier || 'default'}`;
        // 중복 요청 방지
        const existingPromise = this.tokenExchangePromises.get(cacheKey);
        if (existingPromise) {
            return existingPromise;
        }
        const exchangePromise = this._exchangeGoogleAuthorizationCode(code, options);
        this.tokenExchangePromises.set(cacheKey, exchangePromise);
        try {
            const result = await exchangePromise;
            return result;
        }
        finally {
            this.tokenExchangePromises.delete(cacheKey);
        }
    }
    async _exchangeGoogleAuthorizationCode(code, options = {}) {
        this.ensureGoogleEnv();
        const body = new URLSearchParams({
            client_id: env_1.env.googleClientId,
            client_secret: env_1.env.googleClientSecret,
            code,
            grant_type: 'authorization_code',
            redirect_uri: this.resolveGoogleRedirectUri(options.redirectUri),
        });
        if (options.codeVerifier) {
            body.set('code_verifier', options.codeVerifier);
        }
        const response = await this.fetchWithTimeout('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });
        if (!response.ok) {
            const text = await response.text();
            throw new common_1.ServiceUnavailableException(`Google token exchange failed: ${response.status} ${text}`);
        }
        const result = (await response.json());
        if (!result.refresh_token) {
            throw new common_1.ServiceUnavailableException('Google did not return a refresh_token');
        }
        return result.refresh_token;
    }
};
exports.SocialAuthService = SocialAuthService;
exports.SocialAuthService = SocialAuthService = SocialAuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)((0, common_1.forwardRef)(() => auth_service_1.AuthService))),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        cacheService_1.CacheService,
        auth_service_1.AuthService])
], SocialAuthService);
