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
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jwtService_1 = require("../../services/jwtService");
const sessionService_1 = require("../../services/sessionService");
const supabaseService_1 = require("../../services/supabaseService");
const oauth_token_service_1 = require("../../services/oauth-token.service");
const optimized_oauth_service_1 = require("../oauth/optimized-oauth.service");
const cacheService_1 = require("../../services/cacheService");
const mappers_1 = require("../../utils/mappers");
const social_auth_service_1 = require("../oauth/social-auth.service");
const user_repository_1 = require("../../repositories/user.repository");
const auth_session_service_1 = require("../shared/auth-session.service");
const enhanced_jwt_service_1 = require("../../services/enhanced-jwt.service");
let AuthService = AuthService_1 = class AuthService {
    constructor(supabaseService, oauthTokenService, jwtTokenService, sessionService, cacheService, userRepository, dataSource, 
    // forwardRef 제거: AuthModule이 OAuthModule을 import하므로 단방향 의존 가능
    optimizedOAuthService, socialAuthService, 
    // 세션 생성 로직을 AuthSessionService로 위임 (SocialAuthService와 공유)
    authSessionService, 
    // 통합 로그아웃 플로우에서 JWT blacklist 처리에 사용
    enhancedJwtService) {
        this.supabaseService = supabaseService;
        this.oauthTokenService = oauthTokenService;
        this.jwtTokenService = jwtTokenService;
        this.sessionService = sessionService;
        this.cacheService = cacheService;
        this.userRepository = userRepository;
        this.dataSource = dataSource;
        this.optimizedOAuthService = optimizedOAuthService;
        this.socialAuthService = socialAuthService;
        this.authSessionService = authSessionService;
        this.enhancedJwtService = enhancedJwtService;
        this.logger = new common_1.Logger(AuthService_1.name);
        this.identifierCache = new Map();
        this.IDENTIFIER_CACHE_TTL = 5 * 60 * 1000;
        this.IDENTIFIER_CACHE_REDIS_PREFIX = 'identifier';
        // 사용자 정보 캐시 (2분 TTL, 빠른 재로그인)
        this.userCache = new Map();
        this.USER_CACHE_TTL = 2 * 60 * 1000;
    }
    // ---------------------------------------------------------------------------
    // 인메모리 캐시 헬퍼 (identifier -> email 매핑)
    // ---------------------------------------------------------------------------
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
    // ---------------------------------------------------------------------------
    // Redis 기반 사용자 캐시 헬퍼 (보안상 password_hash 미포함)
    // ---------------------------------------------------------------------------
    async getCachedUser(email) {
        try {
            return await this.cacheService.get(email, {
                prefix: 'user',
                ttl: 120,
            });
        }
        catch (error) {
            this.logger.warn('Failed to get cached user, continuing without cache', error);
            return null;
        }
    }
    async setCachedUser(email, user) {
        try {
            const sanitizedUser = { ...user, password_hash: '' };
            await this.cacheService.set(email, sanitizedUser, {
                prefix: 'user',
                ttl: 120,
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
    // ---------------------------------------------------------------------------
    // TypeORM User 엔티티 → UserRecord 변환 (password_hash는 비워서 반환)
    // ---------------------------------------------------------------------------
    toUserRecord(user, includePasswordHash = false) {
        return {
            id: user.id,
            email: user.email.toLowerCase(),
            name: user.name,
            username: user.username,
            avatar_url: user.avatar_url,
            created_at: user.created_at,
            updated_at: user.updated_at,
            password_hash: includePasswordHash ? (user.password_hash ?? '') : '',
            role: user.role ?? 'user',
        };
    }
    // ---------------------------------------------------------------------------
    // authenticateUserDirect: TypeORM Repository 기반 인증
    // 캐시 레이어: Redis user cache → TypeORM query → bcrypt.compare (캐시 없음)
    // ---------------------------------------------------------------------------
    async authenticateUserDirect(identifier, password, options = {}) {
        const authStartTime = Date.now();
        const lookupMode = options.lookupType ?? 'email';
        // 1단계: TypeORM Repository로 사용자 조회 (N+1 방지 - 단일 쿼리)
        // bcrypt 캐시는 보안상 제거됨 — 매 요청마다 bcrypt.compare 수행
        const shouldUseEmailLookup = lookupMode === 'email' || (lookupMode === 'auto' && identifier.includes('@'));
        let user = null;
        try {
            if (shouldUseEmailLookup) {
                user = await this.userRepository.findByEmail(identifier.toLowerCase());
            }
            else {
                user = await this.userRepository.findByUsername(identifier);
            }
        }
        catch (error) {
            this.logger.error(`[authenticateUserDirect] TypeORM query failed for ${identifier}`, error);
            return null;
        }
        if (!user)
            return null;
        const resolvedEmail = user.email?.toLowerCase();
        if (!resolvedEmail) {
            this.logger.warn('Profile row missing email, aborting authentication');
            return null;
        }
        // 3단계: 비밀번호 검증 (매 요청마다 bcrypt.compare 수행 — 캐시 없음)
        let isValidPassword = false;
        if (user.password_hash) {
            isValidPassword = await bcryptjs_1.default.compare(password, user.password_hash);
        }
        else {
            // password_hash 없는 경우 Supabase 인증으로 폴백 (소셜 전용 계정)
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
        this.logger.debug(`TypeORM auth completed in ${authDuration}ms for ${resolvedEmail}`);
        const userRecord = this.toUserRecord(user);
        // 인증 성공 후 Redis 캐시에 저장 (다음 요청을 위한 선제 캐싱)
        void this.setCachedUser(resolvedEmail, userRecord);
        return userRecord;
    }
    // ---------------------------------------------------------------------------
    // createAuthSession: 세션 + 토큰 쌍 생성 (AuthSessionService에 위임)
    // ---------------------------------------------------------------------------
    async createAuthSession(user, loginType) {
        // 공유 로직은 AuthSessionService에 위임
        // SocialAuthService도 동일한 AuthSessionService를 사용하므로 중복 없음
        return this.authSessionService.createAuthSession(user, loginType);
    }
    // ---------------------------------------------------------------------------
    // socialLoginWithCode: OAuth 인가코드/토큰 기반 소셜 로그인
    // ---------------------------------------------------------------------------
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
        return this.optimizedOAuthService.fastOAuthLogin(codeOrToken, provider, oauthOptions);
    }
    // ---------------------------------------------------------------------------
    // signup
    // ---------------------------------------------------------------------------
    async signup(input) {
        const startTime = Date.now();
        const lowerEmail = input.email.toLowerCase();
        const [supabaseUser, passwordHash] = await Promise.all([
            this.supabaseService.signUp(lowerEmail, input.password, {
                name: input.name,
            }),
            bcryptjs_1.default.hash(input.password, 10),
        ]);
        if (!supabaseUser) {
            throw new common_1.InternalServerErrorException('Supabase createUser did not return a user');
        }
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
        setImmediate(() => {
            void this.markLastLogin(newUser.id);
            void this.warmAuthCaches(newUser);
        });
        const duration = Date.now() - startTime;
        this.logger.debug(`Fast signup completed in ${duration}ms for ${lowerEmail}`);
        return result;
    }
    // ---------------------------------------------------------------------------
    // login
    // ---------------------------------------------------------------------------
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
        if (loginType === 'username') {
            const cachedEmail = await this.getIdentifierFromSharedCache(identifier);
            if (cachedEmail) {
                lookupValue = cachedEmail;
                emailHint = cachedEmail;
            }
        }
        const user = await this.authenticateUserDirect(lookupValue, input.password, {
            lookupType: loginType === 'username' && !emailHint ? 'username' : 'email',
            emailHint,
        });
        if (!user) {
            throw new common_1.UnauthorizedException('Invalid credentials');
        }
        const [result] = await Promise.all([
            this.createAuthSession(user, loginType),
            this.markLastLogin(user.id),
            Promise.resolve().then(() => {
                this.warmAuthCaches(user);
            }),
        ]);
        const duration = Date.now() - startTime;
        this.logger.debug(`Fast login completed in ${duration}ms for ${identifier}`);
        return result;
    }
    // ---------------------------------------------------------------------------
    // refresh: TypeORM Repository로 사용자 재조회
    // ---------------------------------------------------------------------------
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
            // TypeORM Repository로 사용자 조회 (password_hash 제외한 필요 컬럼만 선택)
            const userEntity = await this.userRepository
                .getRepository()
                .createQueryBuilder('user')
                .select([
                'user.id',
                'user.email',
                'user.name',
                'user.username',
                'user.avatar_url',
                'user.created_at',
                'user.updated_at',
                'user.role',
            ])
                .where('user.id = :id', { id: payload.sub })
                .getOne();
            if (userEntity) {
                user = this.toUserRecord(userEntity);
            }
            else {
                // DB에 없으면 Supabase fallback
                const supabaseUser = await this.supabaseService.getUserById(payload.sub);
                if (!supabaseUser) {
                    throw new common_1.UnauthorizedException('User not found in Supabase');
                }
                user = (0, mappers_1.fromSupabaseUser)(supabaseUser);
            }
        }
        catch (error) {
            if (error instanceof common_1.UnauthorizedException)
                throw error;
            this.logger.error(`[refresh] User verification failed for sub=${payload.sub}`, error);
            throw new common_1.UnauthorizedException('User verification failed');
        }
        // 기존 세션 즉시 폐기 후 새 세션 발급
        await this.sessionService.deleteSession(payload.sessionId);
        const resolvedLoginType = currentSession.loginType ?? 'email';
        const sessionPayload = await this.createAuthSession(user, resolvedLoginType);
        return {
            user,
            tokenPair: sessionPayload.tokenPair,
            loginType: sessionPayload.loginType,
            session: sessionPayload.session,
        };
    }
    // ---------------------------------------------------------------------------
    // deleteAccount: TypeORM DataSource 트랜잭션으로 로컬 데이터 삭제
    // ---------------------------------------------------------------------------
    async deleteAccount(user, loginTypeHint) {
        const startTime = Date.now();
        // 1단계: 소셜 프로필 정보 조회 (TypeORM Repository 사용)
        let avatarUrl = user.avatar_url ?? null;
        let profileLoginType = null;
        let appleRefreshToken = null;
        let googleRefreshToken = null;
        try {
            const socialInfo = await this.userRepository.findSocialProfileInfo(user.id);
            if (socialInfo) {
                profileLoginType = socialInfo.login_type ?? null;
                avatarUrl = avatarUrl ?? socialInfo.avatar_url;
                appleRefreshToken = socialInfo.apple_refresh_token;
                googleRefreshToken = socialInfo.google_refresh_token;
            }
        }
        catch (error) {
            this.logger.warn('[deleteAccount] Failed to fetch profile social info from DB', error);
        }
        // DB 조회 실패 시 Supabase fallback
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
        // loginType 결정: refresh token > loginTypeHint 순으로 보완
        if (!profileLoginType) {
            if (appleRefreshToken)
                profileLoginType = 'apple';
            else if (googleRefreshToken)
                profileLoginType = 'google';
        }
        if (!profileLoginType && loginTypeHint) {
            profileLoginType = loginTypeHint;
        }
        // 2단계: OAuth 통합 토큰 테이블에서 추가 조회
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
            if (profileLoginType === 'kakao') {
                const kakaoRefreshToken = kakaoToken ?? null;
                if (kakaoRefreshToken) {
                    try {
                        await this.socialAuthService.revokeKakaoConnection(user.id, kakaoRefreshToken);
                    }
                    catch (error) {
                        this.logger.warn('[deleteAccount] Kakao revoke failed', error);
                    }
                }
            }
        }
        catch (error) {
            this.logger.warn('[deleteAccount] Failed to load refresh tokens', error);
        }
        // 3단계: 소셜 연결 해제
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
        // 4단계: TypeORM 트랜잭션으로 로컬 데이터 일괄 삭제
        const localCleanup = this.dataSource.transaction(async (manager) => {
            await this.userRepository.deleteAccountData(user.id, manager);
        });
        // 5단계: Supabase auth 테이블 사용자 삭제 (병렬)
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
        // 6단계: 인메모리 캐시 즉시 제거
        this.identifierCache.delete(user.email.toLowerCase());
        if (user.username) {
            this.identifierCache.delete(user.username.toLowerCase());
        }
        const cacheCleanup = Promise.all([
            this.socialAuthService
                .invalidateOAuthCacheByUser(user.id)
                .catch((error) => this.logger.warn('[deleteAccount] OAuth cache cleanup failed', error)),
            this.cacheService
                .invalidateUserCache(user.id)
                .catch((error) => this.logger.warn('[deleteAccount] User cache invalidation failed', error)),
        ]);
        const profileImageDeletion = this.supabaseService
            .deleteProfileImage(avatarUrl)
            .catch((error) => this.logger.warn('[deleteAccount] Profile image deletion failed', error));
        await Promise.all([localCleanup, supabaseDeletion, cacheCleanup, profileImageDeletion]);
        const duration = Date.now() - startTime;
        this.logger.debug(`Account deletion completed in ${duration}ms for ${user.email}`);
        return { supabaseDeleted };
    }
    // ---------------------------------------------------------------------------
    // markLastLogin: TypeORM QueryBuilder로 updated_at 갱신 (SELECT 없이 UPDATE only)
    // ---------------------------------------------------------------------------
    async markLastLogin(userId) {
        try {
            await this.userRepository.markLastLogin(userId);
        }
        catch (error) {
            this.logger.warn(`[markLastLogin] Failed to update last login for user ${userId}`, error);
        }
    }
    // ---------------------------------------------------------------------------
    // logoutBySessionId  (기존 — 세션 삭제만)
    // ---------------------------------------------------------------------------
    async logoutBySessionId(sessionId) {
        if (!sessionId) {
            throw new common_1.UnauthorizedException('sessionId is required');
        }
        const deleted = await this.sessionService.deleteSession(sessionId);
        return { revoked: deleted };
    }
    // ---------------------------------------------------------------------------
    // logout  — 통합 로그아웃 플로우
    //   1. 세션 삭제 (SessionService)
    //   2. JWT blacklist 추가 (EnhancedJwtService)
    //
    // 두 작업을 하나의 메서드로 묶어 클라이언트가 별도 엔드포인트를 신경 쓰지 않아도 됨.
    // 어느 한 쪽이 실패해도 최대한 나머지를 처리하고 결과를 반환한다.
    // ---------------------------------------------------------------------------
    /**
     * 통합 로그아웃 플로우
     *
     * 1. 세션 삭제 (SessionService) — 필수
     * 2. JWT blacklist 추가 (EnhancedJwtService) — accessToken 전달 시 처리
     *
     * 두 작업을 하나의 메서드로 묶어 클라이언트가 /logout 와 /logout-jwt 를
     * 각각 호출하지 않아도 된다. 어느 한 쪽이 실패해도 나머지를 계속 처리한다.
     */
    async logout(params) {
        if (!params.sessionId) {
            throw new common_1.UnauthorizedException('sessionId is required');
        }
        // 1. 세션 삭제 (필수)
        let revoked = false;
        try {
            revoked = await this.sessionService.deleteSession(params.sessionId);
        }
        catch (error) {
            this.logger.warn('[logout] Session deletion failed', error);
        }
        // 2. JWT blacklist 추가 (선택 — accessToken 미전달 시 건너뜀)
        let tokenInvalidated = false;
        if (params.accessToken) {
            try {
                tokenInvalidated = await this.enhancedJwtService.invalidateToken(params.accessToken, 'logout');
            }
            catch (error) {
                this.logger.warn('[logout] JWT blacklisting failed', error);
            }
        }
        this.logger.debug(`[logout] sessionId=${params.sessionId} revoked=${revoked} tokenInvalidated=${tokenInvalidated}`);
        return { revoked, tokenInvalidated };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(6, (0, typeorm_1.InjectDataSource)()),
    __metadata("design:paramtypes", [supabaseService_1.SupabaseService,
        oauth_token_service_1.OAuthTokenService,
        jwtService_1.JwtTokenService,
        sessionService_1.SessionService,
        cacheService_1.CacheService,
        user_repository_1.UserRepository,
        typeorm_2.DataSource,
        optimized_oauth_service_1.OptimizedOAuthService,
        social_auth_service_1.SocialAuthService,
        auth_session_service_1.AuthSessionService,
        enhanced_jwt_service_1.EnhancedJwtService])
], AuthService);
