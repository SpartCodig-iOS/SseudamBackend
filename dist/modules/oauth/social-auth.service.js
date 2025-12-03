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
const pool_1 = require("../../db/pool");
const background_job_service_1 = require("../../services/background-job.service");
let SocialAuthService = SocialAuthService_1 = class SocialAuthService {
    constructor(supabaseService, cacheService, authService, backgroundJobService) {
        this.supabaseService = supabaseService;
        this.cacheService = cacheService;
        this.authService = authService;
        this.backgroundJobService = backgroundJobService;
        this.logger = new common_1.Logger(SocialAuthService_1.name);
        // Apple JWT 토큰 캐싱 (10분 TTL)
        this.appleClientSecretCache = null;
        // OAuth 토큰 교환 요청 캐싱 (중복 요청 방지)
        this.tokenExchangePromises = new Map();
        this.OAUTH_USER_CACHE_TTL_SECONDS = 10 * 60; // 10분으로 확대하여 캐시 적중률 상승
        this.OAUTH_TOKEN_CACHE_PREFIX = 'oauth:token';
        this.OAUTH_USER_INDEX_PREFIX = 'oauth:user-index';
        this.OAUTH_USER_INDEX_TTL_SECONDS = 60 * 30; // 30분
        this.OAUTH_USER_INDEX_LIMIT = 12;
        this.oauthCheckCache = new Map();
        this.OAUTH_CHECK_CACHE_TTL = 5 * 60 * 1000; // 5분
        this.localTokenCache = new Map();
        this.LOCAL_TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5분
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
    getLocalCachedUser(accessToken) {
        const cached = this.localTokenCache.get(accessToken);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.localTokenCache.delete(accessToken);
            return null;
        }
        return cached.user;
    }
    setLocalCachedUser(accessToken, user) {
        this.localTokenCache.set(accessToken, {
            user,
            expiresAt: Date.now() + this.LOCAL_TOKEN_CACHE_TTL,
        });
    }
    async profileExists(userId) {
        const pool = await (0, pool_1.getPool)();
        const result = await pool.query(`SELECT 1 FROM profiles WHERE id = $1 LIMIT 1`, [userId]);
        return Boolean(result.rows[0]);
    }
    // Redis 기반 OAuth 사용자 캐시 (fallback으로 내부 CacheService 메모리 캐시 사용)
    async getCachedOAuthUser(accessToken) {
        const local = this.getLocalCachedUser(accessToken);
        if (local) {
            return local;
        }
        const cacheKey = this.getTokenCacheKey(accessToken);
        const cached = await this.cacheService.get(cacheKey, {
            prefix: this.OAUTH_TOKEN_CACHE_PREFIX,
        });
        if (cached) {
            this.setLocalCachedUser(accessToken, cached);
        }
        return cached ?? null;
    }
    async setCachedOAuthUser(accessToken, user) {
        this.setLocalCachedUser(accessToken, user);
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
    getCachedCheck(accessToken) {
        const cached = this.oauthCheckCache.get(accessToken);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.oauthCheckCache.delete(accessToken);
            return null;
        }
        return { registered: cached.registered };
    }
    setCachedCheck(accessToken, registered) {
        this.oauthCheckCache.set(accessToken, {
            registered,
            expiresAt: Date.now() + this.OAUTH_CHECK_CACHE_TTL,
        });
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
        // 🚀 ULTRA-FAST: 캐시된 사용자 정보 확인 (< 1ms)
        const cachedUser = await this.getCachedOAuthUser(accessToken);
        if (cachedUser) {
            this.logger.debug(`OAuth user cache hit for token ${accessToken.substring(0, 10)}...`);
            // 캐시된 사용자로 즉시 세션 생성
            const authSession = await this.authService.createAuthSession(cachedUser, loginType);
            // 백그라운드에서 캐시 워밍 (응답에 영향 없음)
            setImmediate(() => {
                this.authService.warmAuthCaches(cachedUser);
            });
            const duration = Date.now() - startTime;
            this.logger.debug(`ULTRA-FAST OAuth login completed in ${duration}ms (cache hit)`);
            return authSession;
        }
        // 2단계: 병렬 처리로 최적화된 캐시 미스 처리
        const [supabaseUser, existingCheck] = await Promise.allSettled([
            this.supabaseService.getUserFromToken(accessToken),
            this.getCachedCheck(accessToken)
        ]);
        if (supabaseUser.status === 'rejected' || !supabaseUser.value) {
            throw new common_1.UnauthorizedException('Invalid Supabase access token');
        }
        const user = supabaseUser.value;
        const { appleRefreshToken, googleRefreshToken, authorizationCode, codeVerifier, redirectUri } = options;
        // 3단계: 프로필 존재 체크와 토큰 교환을 병렬로 처리
        const parallelTasks = [];
        // 프로필 존재 체크
        const profileExistsPromise = this.profileExists(user.id);
        parallelTasks.push(profileExistsPromise);
        // 토큰 교환 작업들
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
        parallelTasks.push(appleTokenPromise, googleTokenPromise);
        // 모든 병렬 작업 실행
        const [profileExists, appleTokenResult, googleTokenResult] = await Promise.all(parallelTasks);
        const finalAppleRefreshToken = typeof appleTokenResult === 'string' ? appleTokenResult : null;
        const finalGoogleRefreshToken = typeof googleTokenResult === 'string' ? googleTokenResult : null;
        // 4단계: 프로필 생성이 필요한 경우에만 처리
        if (!profileExists || (loginType !== 'email' && loginType !== 'username')) {
            // 프로필 생성을 백그라운드로 처리하지 않고 즉시 처리 (필수 작업)
            await this.supabaseService.ensureProfileFromSupabaseUser(user, loginType);
        }
        // 5단계: 사용자 객체 생성 및 캐싱
        const preferDisplayName = loginType !== 'email' && loginType !== 'username';
        const userRecord = (0, mappers_1.fromSupabaseUser)(user, { preferDisplayName });
        // 6단계: 세션 생성과 캐시 저장을 병렬로 처리
        const [authSession] = await Promise.all([
            this.authService.createAuthSession(userRecord, loginType),
            this.setCachedOAuthUser(accessToken, userRecord),
            this.authService.warmAuthCaches(userRecord)
        ]);
        // 7단계: 모든 백그라운드 작업을 비동기로 처리 (응답 지연 최소화)
        const backgroundTasks = [];
        // 프로필 이미지 미러링
        if (userRecord.avatar_url) {
            backgroundTasks.push(this.backgroundJobService.enqueue(`[social-avatar] ${userRecord.id}`, async () => {
                const mirrored = await this.supabaseService.mirrorProfileAvatar(userRecord.id, userRecord.avatar_url);
                if (mirrored) {
                    userRecord.avatar_url = mirrored;
                }
            }));
        }
        // 토큰 저장
        if (loginType === 'apple' && finalAppleRefreshToken) {
            backgroundTasks.push(this.backgroundJobService.enqueue(`[apple-refresh] ${userRecord.id}`, async () => {
                await this.supabaseService.saveAppleRefreshToken(userRecord.id, finalAppleRefreshToken);
            }));
        }
        if (loginType === 'google' && finalGoogleRefreshToken) {
            backgroundTasks.push(this.backgroundJobService.enqueue(`[google-refresh] ${userRecord.id}`, async () => {
                await this.supabaseService.saveGoogleRefreshToken(userRecord.id, finalGoogleRefreshToken);
            }));
        }
        // 로그인 기록
        backgroundTasks.push(this.backgroundJobService.enqueue(`[markLastLogin] ${userRecord.id}`, async () => {
            await this.authService.markLastLogin(userRecord.id);
        }));
        // 모든 백그라운드 작업을 시작 (await하지 않음)
        Promise.allSettled(backgroundTasks);
        const duration = Date.now() - startTime;
        this.logger.debug(`FAST OAuth login completed in ${duration}ms for ${userRecord.email} (optimized flow)`);
        return authSession;
    }
    async checkOAuthAccount(accessToken, loginType = 'email') {
        const startTime = Date.now();
        if (!accessToken) {
            throw new common_1.UnauthorizedException('Missing Supabase access token');
        }
        // 🚀 ULTRA-FAST: 메모리 캐시 확인 (< 1ms)
        const cachedCheck = this.getCachedCheck(accessToken);
        if (cachedCheck) {
            const duration = Date.now() - startTime;
            this.logger.debug(`ULTRA-FAST OAuth check cache hit: ${duration}ms`);
            return cachedCheck;
        }
        // 🚀 FAST: Redis 캐시와 사용자 토큰을 병렬로 확인
        const cacheKey = `oauth_check:${this.getTokenCacheKey(accessToken)}`;
        const [redisCached, cachedUser] = await Promise.allSettled([
            this.cacheService.get(cacheKey),
            this.getCachedOAuthUser(accessToken)
        ]);
        // Redis 캐시 적중
        if (redisCached.status === 'fulfilled' && redisCached.value) {
            this.setCachedCheck(accessToken, redisCached.value.registered);
            const duration = Date.now() - startTime;
            this.logger.debug(`FAST OAuth check Redis hit: ${duration}ms`);
            return redisCached.value;
        }
        // 캐시된 사용자 적중 - 빠른 profile 테이블 조회
        if (cachedUser.status === 'fulfilled' && cachedUser.value) {
            try {
                // 🚀 빠른 profile 조회 (인덱스 최적화된 단순 쿼리)
                const profile = await this.supabaseService.findProfileById(cachedUser.value.id);
                const result = { registered: Boolean(profile) };
                // 백그라운드에서 캐시 업데이트
                setImmediate(async () => {
                    try {
                        this.setCachedCheck(accessToken, result.registered);
                        await this.cacheService.set(cacheKey, result, { ttl: 300 });
                    }
                    catch (error) {
                        // 백그라운드 캐시 실패는 무시
                    }
                });
                const duration = Date.now() - startTime;
                this.logger.debug(`FAST OAuth check with cached user + profile: ${duration}ms`);
                return result;
            }
            catch (error) {
                // Profile 조회 실패 시 fallback
                this.logger.warn(`Profile lookup failed for cached user:`, error);
            }
        }
        // 🔥 최후의 수단: Supabase 조회 (정확한 profile 확인)
        try {
            const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
            if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
                throw new common_1.UnauthorizedException('Invalid Supabase access token');
            }
            // 🚀 실제 profile 테이블 확인 (정확한 등록 여부)
            const profile = await this.supabaseService.findProfileById(supabaseUser.id);
            const result = { registered: Boolean(profile) };
            // 백그라운드에서 사용자 정보 캐싱 (다음 요청 최적화)
            setImmediate(async () => {
                try {
                    // 사용자 정보 캐싱
                    await this.setCachedOAuthUser(accessToken, {
                        id: supabaseUser.id,
                        email: supabaseUser.email || '',
                        name: supabaseUser.user_metadata?.full_name || supabaseUser.user_metadata?.name || null,
                        avatar_url: supabaseUser.user_metadata?.avatar_url || null,
                        username: supabaseUser.email || supabaseUser.id,
                        password_hash: '',
                        role: 'user',
                        created_at: new Date(),
                        updated_at: new Date(),
                    });
                    // 결과 캐싱
                    this.setCachedCheck(accessToken, result.registered);
                    await this.cacheService.set(cacheKey, result, { ttl: 300 });
                }
                catch (error) {
                    this.logger.warn(`Background OAuth caching failed:`, error);
                }
            });
            const duration = Date.now() - startTime;
            this.logger.debug(`OAuth check completed: ${duration}ms (registered: ${result.registered})`);
            return result;
        }
        catch (error) {
            const duration = Date.now() - startTime;
            this.logger.error(`OAuth check failed after ${duration}ms:`, error);
            throw new common_1.UnauthorizedException('Invalid Supabase access token');
        }
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
        auth_service_1.AuthService,
        background_job_service_1.BackgroundJobService])
], SocialAuthService);
