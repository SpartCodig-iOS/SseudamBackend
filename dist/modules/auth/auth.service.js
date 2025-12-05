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
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwtService_1 = require("../../services/jwtService");
const sessionService_1 = require("../../services/sessionService");
const supabaseService_1 = require("../../services/supabaseService");
const oauth_token_service_1 = require("../../services/oauth-token.service");
const optimized_oauth_service_1 = require("../oauth/optimized-oauth.service");
const cacheService_1 = require("../../services/cacheService");
const mappers_1 = require("../../utils/mappers");
const social_auth_service_1 = require("../oauth/social-auth.service");
const pool_1 = require("../../db/pool");
let AuthService = AuthService_1 = class AuthService {
    constructor(supabaseService, oauthTokenService, jwtTokenService, sessionService, cacheService, optimizedOAuthService, socialAuthService) {
        this.supabaseService = supabaseService;
        this.oauthTokenService = oauthTokenService;
        this.jwtTokenService = jwtTokenService;
        this.sessionService = sessionService;
        this.cacheService = cacheService;
        this.optimizedOAuthService = optimizedOAuthService;
        this.socialAuthService = socialAuthService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.identifierCache = new Map();
        this.IDENTIFIER_CACHE_TTL = 5 * 60 * 1000;
        this.IDENTIFIER_CACHE_REDIS_PREFIX = 'identifier';
        // 성공한 로그인에 대한 bcrypt 캐시 (5분 TTL)
        this.bcryptCache = new Map();
        this.BCRYPT_CACHE_TTL = 5 * 60 * 1000; // 5분
        // 사용자 정보 캐시 (2분 TTL, 빠른 재로그인)
        this.userCache = new Map();
        this.USER_CACHE_TTL = 2 * 60 * 1000; // 2분
    }
    getCachedEmail(identifier) {
        const cached = this.identifierCache.get(identifier);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.identifierCache.delete(identifier);
            return null;
        }
        return cached.email;
    }
    setCachedEmail(identifier, email) {
        this.identifierCache.set(identifier, {
            email,
            expiresAt: Date.now() + this.IDENTIFIER_CACHE_TTL,
        });
        if (this.identifierCache.size > 1000) {
            const oldestKey = this.identifierCache.keys().next().value;
            if (oldestKey) {
                this.identifierCache.delete(oldestKey);
            }
        }
    }
    async getIdentifierFromSharedCache(identifier) {
        const normalizedIdentifier = identifier.toLowerCase();
        const cached = this.getCachedEmail(normalizedIdentifier);
        if (cached) {
            return cached;
        }
        try {
            const sharedCache = await this.cacheService.get(normalizedIdentifier, {
                prefix: this.IDENTIFIER_CACHE_REDIS_PREFIX,
            });
            if (sharedCache) {
                this.setCachedEmail(normalizedIdentifier, sharedCache);
                return sharedCache;
            }
        }
        catch (error) {
            this.logger.debug('Identifier cache lookup failed, continuing without shared cache', error);
        }
        return null;
    }
    rememberIdentifier(identifier, email) {
        const normalizedIdentifier = identifier.toLowerCase();
        const normalizedEmail = email.toLowerCase();
        this.setCachedEmail(normalizedIdentifier, normalizedEmail);
        void this.cacheService.set(normalizedIdentifier, normalizedEmail, {
            prefix: this.IDENTIFIER_CACHE_REDIS_PREFIX,
            ttl: Math.floor(this.IDENTIFIER_CACHE_TTL / 1000),
        }).catch(() => {
            // Shared cache storing failure isn't critical; rely on in-memory cache.
        });
    }
    // bcrypt 캐시 관리 (성능 최적화)
    getCachedBcryptResult(email, password) {
        const cacheKey = `${email}:${password.substring(0, 8)}`;
        const cached = this.bcryptCache.get(cacheKey);
        if (!cached)
            return null;
        if (Date.now() > cached.expiresAt) {
            this.bcryptCache.delete(cacheKey);
            return null;
        }
        return cached.hash === password;
    }
    setCachedBcryptResult(email, password, isValid) {
        if (!isValid)
            return; // 실패한 로그인은 캐시하지 않음
        const cacheKey = `${email}:${password.substring(0, 8)}`;
        this.bcryptCache.set(cacheKey, {
            hash: password,
            expiresAt: Date.now() + this.BCRYPT_CACHE_TTL,
        });
        // 캐시 크기 제한
        if (this.bcryptCache.size > 500) {
            const oldestKey = this.bcryptCache.keys().next().value;
            if (oldestKey) {
                this.bcryptCache.delete(oldestKey);
            }
        }
    }
    // 사용자 캐시 관리 (Redis 기반 재로그인 최적화)
    async getCachedUser(email) {
        try {
            return await this.cacheService.get(email, {
                prefix: 'user',
                ttl: 120, // 2분
            });
        }
        catch (error) {
            this.logger.warn('Failed to get cached user, continuing without cache', error);
            return null;
        }
    }
    async setCachedUser(email, user) {
        try {
            // 보안상 패스워드 해시는 캐시하지 않음
            const sanitizedUser = { ...user, password_hash: '' };
            await this.cacheService.set(email, sanitizedUser, {
                prefix: 'user',
                ttl: 120, // 2분
            });
        }
        catch (error) {
            this.logger.warn('Failed to cache user, continuing without cache', error);
        }
    }
    warmAuthCaches(user) {
        const normalizedEmail = user.email.toLowerCase();
        this.rememberIdentifier(normalizedEmail, normalizedEmail);
        if (user.username) {
            this.rememberIdentifier(user.username.toLowerCase(), normalizedEmail);
        }
        const sanitizedUser = { ...user, password_hash: '' };
        void this.setCachedUser(normalizedEmail, sanitizedUser);
    }
    // 고성능 직접 인증: 캐시 우선 + 단일 쿼리로 사용자 정보 조회 및 비밀번호 확인
    async authenticateUserDirect(identifier, password, options = {}) {
        const authStartTime = Date.now();
        const lookupMode = options.lookupType ?? 'email';
        const cacheEmail = options.emailHint ??
            (identifier.includes('@') ? identifier.toLowerCase() : null);
        // 사용자 정보 캐시 확인 (Redis 기반 초고속)
        if (cacheEmail) {
            const cachedUser = await this.getCachedUser(cacheEmail);
            if (cachedUser) {
                // 캐시된 사용자로 비밀번호 검증
                const cachedBcryptResult = this.getCachedBcryptResult(cacheEmail, password);
                if (cachedBcryptResult === true) {
                    this.logger.debug(`Full Redis cache hit for ${cacheEmail} - ultra fast auth`);
                    return cachedUser;
                }
            }
        }
        const pool = await (0, pool_1.getPool)();
        const shouldUseEmailLookup = lookupMode === 'email' || (lookupMode === 'auto' && identifier.includes('@'));
        const queryParam = shouldUseEmailLookup ? identifier.toLowerCase() : identifier;
        const selectWithPassword = `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           password_hash,
           role
         FROM profiles
         WHERE ${shouldUseEmailLookup ? 'email = $1' : 'username = $1'}
         LIMIT 1`;
        const selectWithoutPassword = `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           role
         FROM profiles
         WHERE ${shouldUseEmailLookup ? 'email = $1' : 'username = $1'}
         LIMIT 1`;
        const selectFallback = `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at
         FROM profiles
         WHERE ${shouldUseEmailLookup ? 'email = $1' : 'username = $1'}
         LIMIT 1`;
        let result;
        try {
            result = await pool.query(selectWithPassword, [queryParam]);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('password_hash')) {
                try {
                    result = await pool.query(selectWithoutPassword, [queryParam]);
                }
                catch (innerError) {
                    if (!(innerError instanceof Error) || !innerError.message.includes('role')) {
                        throw innerError;
                    }
                    result = await pool.query(selectFallback, [queryParam]);
                }
            }
            else if (error instanceof Error && error.message.includes('role')) {
                result = await pool.query(selectFallback, [queryParam]);
            }
            else {
                throw error;
            }
        }
        const row = result.rows[0];
        if (!row)
            return null;
        const resolvedEmail = row.email?.toLowerCase();
        if (!resolvedEmail) {
            this.logger.warn('Profile row missing email, aborting authentication');
            return null;
        }
        // 비밀번호 확인을 병렬로 처리할 수 있도록 준비
        let isValidPassword = false;
        if (row.password_hash) {
            // bcrypt 캐시 확인 (초고속)
            const cachedResult = this.getCachedBcryptResult(resolvedEmail, password);
            if (cachedResult !== null) {
                isValidPassword = cachedResult;
                this.logger.debug(`bcrypt cache hit for ${resolvedEmail}`);
            }
            else {
                // bcrypt 검증 (캐시 미스 시)
                isValidPassword = await bcryptjs_1.default.compare(password, row.password_hash);
                this.setCachedBcryptResult(resolvedEmail, password, isValidPassword);
            }
        }
        else {
            // Supabase 인증으로 폴백 (password_hash가 없는 경우)
            try {
                await this.supabaseService.signIn(resolvedEmail, password);
                isValidPassword = true;
            }
            catch {
                isValidPassword = false;
            }
        }
        if (!isValidPassword)
            return null;
        const authDuration = Date.now() - authStartTime;
        this.logger.debug(`Fast auth completed in ${authDuration}ms for ${resolvedEmail}`);
        const userRecord = {
            id: row.id,
            email: resolvedEmail,
            name: row.name,
            username: row.username,
            avatar_url: row.avatar_url,
            created_at: row.created_at,
            updated_at: row.updated_at,
            password_hash: '', // 보안상 빈 값으로 설정
            role: row.role ?? 'user',
        };
        // 성공한 인증 후 사용자 정보를 Redis 캐시에 저장
        void this.setCachedUser(resolvedEmail, userRecord);
        return userRecord;
    }
    async createAuthSession(user, loginType) {
        const startTime = Date.now();
        // 세션 생성 전 프로필 레코드가 확실히 존재하도록 보장 (FK 오류 방지)
        await this.supabaseService.upsertProfile({
            id: user.id,
            email: user.email,
            name: user.name,
            username: user.username,
            loginType,
            avatarUrl: user.avatar_url,
        });
        // 세션 생성과 토큰 생성을 병렬로 처리 (성능 최적화)
        const [session] = await Promise.all([
            this.sessionService.createSession(user.id, loginType)
        ]);
        // 세션 ID를 받은 후 토큰 생성
        const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType, session.sessionId);
        const duration = Date.now() - startTime;
        this.logger.debug(`Auth session created in ${duration}ms for user ${user.id}`);
        return { user, tokenPair, loginType, session };
    }
    // 소셜 로그인 (인가코드/토큰 전달) 공통 처리
    async socialLoginWithCode(codeOrToken, provider, options = {}) {
        const oauthOptions = {};
        if (options.authorizationCode) {
            oauthOptions.authorizationCode = options.authorizationCode;
        }
        if (options.codeVerifier) {
            oauthOptions.codeVerifier = options.codeVerifier;
        }
        if (options.redirectUri) {
            oauthOptions.redirectUri = options.redirectUri;
        }
        // Kakao는 authorizationCode를 넘기면 내부에서 교환하여 진행, 그 외는 Supabase access token 사용
        return this.optimizedOAuthService.fastOAuthLogin(codeOrToken, provider, oauthOptions);
    }
    async signup(input) {
        const startTime = Date.now();
        const lowerEmail = input.email.toLowerCase();
        // 모든 작업을 병렬로 처리 (성능 최적화)
        const [supabaseUser, passwordHash] = await Promise.all([
            this.supabaseService.signUp(lowerEmail, input.password, {
                name: input.name,
            }),
            bcryptjs_1.default.hash(input.password, 4) // 6 -> 4로 더 단축 (로그인 성능 우선)
        ]);
        if (!supabaseUser) {
            throw new common_1.InternalServerErrorException('Supabase createUser did not return a user');
        }
        // username 생성 최적화
        const username = lowerEmail.includes('@')
            ? lowerEmail.split('@')[0].toLowerCase()
            : `user_${supabaseUser.id.substring(0, 8)}`;
        const newUser = {
            id: supabaseUser.id,
            email: lowerEmail,
            name: input.name ?? null,
            avatar_url: null,
            created_at: new Date(),
            updated_at: new Date(),
            username,
            password_hash: passwordHash,
            role: 'user',
        };
        const result = await this.createAuthSession(newUser, 'signup');
        // 부가 작업은 응답과 분리해 지연 최소화
        setImmediate(() => {
            void this.markLastLogin(newUser.id);
            void this.warmAuthCaches(newUser);
        });
        const duration = Date.now() - startTime;
        this.logger.debug(`Fast signup completed in ${duration}ms for ${lowerEmail}`);
        return result;
    }
    async login(input) {
        const startTime = Date.now();
        const identifier = input.identifier.trim().toLowerCase();
        if (!identifier) {
            throw new common_1.UnauthorizedException('identifier is required');
        }
        if (!input.password) {
            throw new common_1.UnauthorizedException('Password is required for email/username login');
        }
        let loginType = identifier.includes('@') ? 'email' : 'username';
        let lookupValue = identifier;
        let emailHint = loginType === 'email' ? identifier : undefined;
        // username 로그인 시 캐시 기반으로 이메일 힌트 확보 (없으면 username으로 직접 조회)
        if (loginType === 'username') {
            const cachedEmail = await this.getIdentifierFromSharedCache(identifier);
            if (cachedEmail) {
                lookupValue = cachedEmail;
                emailHint = cachedEmail;
            }
        }
        // 고성능 직접 인증: Supabase 대신 직접 DB 쿼리 (더 빠름)
        const user = await this.authenticateUserDirect(lookupValue, input.password, {
            lookupType: loginType === 'username' && !emailHint ? 'username' : 'email',
            emailHint,
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        // 세션 생성과 캐시 업데이트를 병렬로 처리 (성능 최적화)
        const [result] = await Promise.all([
            this.createAuthSession(user, loginType),
            this.markLastLogin(user.id),
            // 캐시 업데이트를 백그라운드에서 처리
            Promise.resolve().then(() => {
                this.warmAuthCaches(user);
            })
        ]);
        const duration = Date.now() - startTime;
        this.logger.debug(`Fast login completed in ${duration}ms for ${identifier}`);
        return result;
    }
    async refresh(refreshToken) {
        const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
        if (!payload.sub || !payload.sessionId) {
            throw new common_1.UnauthorizedException('Invalid refresh token');
        }
        const currentSession = await this.sessionService.getSession(payload.sessionId);
        if (!currentSession || !currentSession.isActive) {
            throw new common_1.UnauthorizedException('Session expired or revoked');
        }
        let user;
        try {
            const pool = await (0, pool_1.getPool)();
            const profile = await pool.query(`SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           role
         FROM profiles
         WHERE id = $1
         LIMIT 1`, [payload.sub]);
            const row = profile.rows[0];
            if (row) {
                user = {
                    id: row.id,
                    email: row.email,
                    name: row.name,
                    avatar_url: row.avatar_url,
                    username: row.username,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    password_hash: '',
                    role: row.role ?? 'user',
                };
            }
            else {
                const supabaseUser = await this.supabaseService.getUserById(payload.sub);
                if (!supabaseUser) {
                    throw new common_1.UnauthorizedException('User not found in Supabase');
                }
                user = (0, mappers_1.fromSupabaseUser)(supabaseUser);
            }
        }
        catch (error) {
            throw new common_1.UnauthorizedException('User verification failed');
        }
        // 기존 세션은 재사용하지 않으므로 즉시 폐기
        await this.sessionService.deleteSession(payload.sessionId);
        const resolvedLoginType = currentSession.loginType ?? 'email';
        const sessionPayload = await this.createAuthSession(user, resolvedLoginType);
        return { user, tokenPair: sessionPayload.tokenPair, loginType: sessionPayload.loginType, session: sessionPayload.session };
    }
    async deleteAccount(user, loginTypeHint) {
        const startTime = Date.now();
        const pool = await (0, pool_1.getPool)();
        // 프로필 타입 조회 (DB 우선, 실패 시 Supabase)
        let avatarUrl = user.avatar_url ?? null;
        let profileLoginType = null;
        let appleRefreshToken = null;
        let googleRefreshToken = null;
        try {
            const directProfile = await pool.query(`SELECT login_type, apple_refresh_token, google_refresh_token, avatar_url
         FROM profiles
         WHERE id = $1
         LIMIT 1`, [user.id]);
            const profileRow = directProfile.rows[0];
            if (profileRow) {
                profileLoginType = profileRow.login_type ?? null;
                avatarUrl = avatarUrl ?? profileRow.avatar_url;
            }
        }
        catch (error) {
            this.logger.warn('[deleteAccount] Failed to fetch profile login type from DB', error);
        }
        if (!profileLoginType) {
            try {
                const profile = await this.supabaseService.findProfileById(user.id);
                profileLoginType = profile?.login_type ?? null;
                avatarUrl = avatarUrl ?? profile?.avatar_url ?? null;
            }
            catch (error) {
                this.logger.warn('[deleteAccount] Failed to fetch profile login type via Supabase', error);
            }
        }
        if (!profileLoginType) {
            if (appleRefreshToken) {
                profileLoginType = 'apple';
            }
            else if (googleRefreshToken) {
                profileLoginType = 'google';
            }
        }
        if (!profileLoginType && loginTypeHint) {
            profileLoginType = loginTypeHint;
        }
        // 통합 토큰 테이블에서 조회
        try {
            const [appleToken, googleToken, kakaoToken] = await Promise.all([
                this.oauthTokenService.getToken(user.id, 'apple'),
                this.oauthTokenService.getToken(user.id, 'google'),
                this.oauthTokenService.getToken(user.id, 'kakao'),
            ]);
            appleRefreshToken = appleRefreshToken ?? appleToken;
            googleRefreshToken = googleRefreshToken ?? googleToken;
            if (!profileLoginType && kakaoToken) {
                profileLoginType = 'kakao';
            }
            const kakaoRefreshToken = kakaoToken ?? null;
            if (profileLoginType === 'kakao' && kakaoRefreshToken) {
                try {
                    await this.socialAuthService.revokeKakaoConnection(user.id, kakaoRefreshToken);
                }
                catch (error) {
                    this.logger.warn('[deleteAccount] Kakao revoke failed', error);
                }
            }
        }
        catch (error) {
            this.logger.warn('[deleteAccount] Failed to load refresh tokens', error);
        }
        await (async () => {
            if (profileLoginType === 'apple') {
                if (appleRefreshToken) {
                    try {
                        await this.socialAuthService.revokeAppleConnection(user.id, appleRefreshToken);
                    }
                    catch (error) {
                        this.logger.warn('[deleteAccount] Apple revoke failed', error);
                    }
                }
                else {
                    this.logger.warn('[deleteAccount] Apple refresh token missing, skipping revoke');
                }
            }
            else if (profileLoginType === 'google') {
                if (googleRefreshToken) {
                    try {
                        await this.socialAuthService.revokeGoogleConnection(user.id, googleRefreshToken);
                    }
                    catch (error) {
                        this.logger.warn('[deleteAccount] Google revoke failed', error);
                    }
                }
                else {
                    this.logger.warn('[deleteAccount] Google refresh token missing, skipping revoke');
                }
            }
            else if (profileLoginType === 'kakao') {
                const kakaoToken = await this.oauthTokenService.getToken(user.id, 'kakao');
                if (kakaoToken) {
                    try {
                        await this.socialAuthService.revokeKakaoConnection(user.id, kakaoToken);
                    }
                    catch (error) {
                        this.logger.warn('[deleteAccount] Kakao revoke failed', error);
                    }
                }
                else {
                    this.logger.warn('[deleteAccount] Kakao refresh token missing, skipping revoke');
                }
            }
        })();
        const localCleanup = (async () => {
            const client = await pool.connect();
            try {
                await client.query('BEGIN');
                await client.query(`DELETE FROM travel_expense_participants
           WHERE member_id = $1
              OR expense_id IN (
                SELECT id FROM travel_expenses WHERE payer_id = $1
              )`, [user.id]);
                await client.query('DELETE FROM travel_expenses WHERE payer_id = $1', [user.id]);
                await client.query('DELETE FROM travel_members WHERE user_id = $1', [user.id]);
                await client.query('DELETE FROM travel_invites WHERE created_by = $1', [user.id]);
                await client.query('DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1', [user.id]);
                await client.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
                await client.query('DELETE FROM profiles WHERE id = $1', [user.id]);
                await client.query('COMMIT');
            }
            catch (error) {
                await client.query('ROLLBACK');
                throw error;
            }
            finally {
                client.release();
            }
        })();
        // 4) Supabase 사용자 삭제 (auth 테이블만)
        let supabaseDeleted = false;
        const supabaseDeletion = (async () => {
            try {
                await this.supabaseService.deleteUser(user.id);
                supabaseDeleted = true;
            }
            catch (error) {
                const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
                if (!message.includes('not found')) {
                    this.logger.warn('[deleteAccount] Supabase deletion failed', error);
                }
                else {
                    supabaseDeleted = true;
                }
            }
        })();
        // 캐시에서도 제거
        this.identifierCache.delete(user.email.toLowerCase());
        if (user.username) {
            this.identifierCache.delete(user.username.toLowerCase());
        }
        const cacheCleanup = Promise.all([
            // OAuth 캐시 정리
            this.socialAuthService.invalidateOAuthCacheByUser(user.id)
                .catch((error) => this.logger.warn('[deleteAccount] OAuth cache cleanup failed', error)),
            // 사용자 관련 모든 캐시 무효화 (새로운 Redis 캐시 무효화 전략)
            this.cacheService.invalidateUserCache(user.id)
                .catch((error) => this.logger.warn('[deleteAccount] User cache invalidation failed', error)),
        ]);
        const profileImageDeletion = this.supabaseService.deleteProfileImage(avatarUrl)
            .catch((error) => this.logger.warn('[deleteAccount] Profile image deletion failed', error));
        await Promise.all([localCleanup, supabaseDeletion, cacheCleanup, profileImageDeletion]);
        const duration = Date.now() - startTime;
        this.logger.debug(`Fast account deletion completed in ${duration}ms for ${user.email}`);
        return { supabaseDeleted };
    }
    async markLastLogin(userId) {
        try {
            const pool = await (0, pool_1.getPool)();
            await pool.query(`UPDATE profiles
         SET updated_at = NOW()
         WHERE id = $1`, [userId]);
        }
        catch (error) {
            this.logger.warn(`[markLastLogin] Failed to update last login for user ${userId}`, error);
        }
    }
    async logoutBySessionId(sessionId) {
        if (!sessionId) {
            throw new common_1.UnauthorizedException('sessionId is required');
        }
        const deleted = await this.sessionService.deleteSession(sessionId);
        return { revoked: deleted };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(5, (0, common_1.Inject)((0, common_1.forwardRef)(() => optimized_oauth_service_1.OptimizedOAuthService))),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => social_auth_service_1.SocialAuthService))),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        oauth_token_service_1.OAuthTokenService,
        jwtService_1.JwtTokenService,
        sessionService_1.SessionService,
        cacheService_1.CacheService,
        optimized_oauth_service_1.OptimizedOAuthService,
        social_auth_service_1.SocialAuthService])
], AuthService);
