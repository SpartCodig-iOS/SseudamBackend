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
var AuthController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_service_1 = require("./auth.service");
const optimized_delete_service_1 = require("./optimized-delete.service");
const api_1 = require("../../types/api");
const authSchemas_1 = require("../../validators/authSchemas");
const auth_guard_1 = require("../../common/guards/auth.guard");
const rate_limit_guard_1 = require("../../common/guards/rate-limit.guard");
const auth_response_dto_1 = require("./dto/auth-response.dto");
const auth_response_util_1 = require("./auth-response.util");
const rate_limit_decorator_1 = require("../../common/decorators/rate-limit.decorator");
const device_token_service_1 = require("../../services/device-token.service");
const analytics_service_1 = require("../../services/analytics.service");
const jwtService_1 = require("../../services/jwtService");
const sessionService_1 = require("../../services/sessionService");
const enhanced_jwt_service_1 = require("../../services/enhanced-jwt.service");
const jwt_blacklist_service_1 = require("../../services/jwt-blacklist.service");
let AuthController = AuthController_1 = class AuthController {
    constructor(authService, optimizedDeleteService, deviceTokenService, analyticsService, jwtTokenService, sessionService, enhancedJwtService, jwtBlacklistService) {
        this.authService = authService;
        this.optimizedDeleteService = optimizedDeleteService;
        this.deviceTokenService = deviceTokenService;
        this.analyticsService = analyticsService;
        this.jwtTokenService = jwtTokenService;
        this.sessionService = sessionService;
        this.enhancedJwtService = enhancedJwtService;
        this.jwtBlacklistService = jwtBlacklistService;
        this.logger = new common_1.Logger(AuthController_1.name);
    }
    async signup(body) {
        const payload = authSchemas_1.signupSchema.parse(body);
        const result = await this.authService.signup(payload);
        // deviceToken이 제공되면 디바이스 토큰 저장
        if (result.user?.id) {
            await this.deviceTokenService.bindPendingTokensToUser(result.user.id, payload.pendingKey, payload.deviceToken).catch(err => console.warn('Failed to bind device token:', err.message));
        }
        // Analytics: 회원가입 성공
        if (result.user?.id) {
            this.analyticsService.trackEvent('signup_success', { provider: payload.provider ?? 'email' }, { userId: result.user.id }).catch(() => undefined);
        }
        return (0, api_1.success)((0, auth_response_util_1.buildAuthSessionResponse)(result), 'Signup successful');
    }
    async login(body) {
        const payload = authSchemas_1.loginSchema.parse(body);
        // 소셜 로그인 분기: provider=kakao/apple/google && accessToken/authorizationCode 제공
        if (payload.provider && payload.provider !== 'email' && (payload.accessToken || payload.authorizationCode)) {
            if (payload.provider !== 'kakao' && !payload.accessToken) {
                throw new common_1.UnauthorizedException('accessToken is required for social login');
            }
            if (payload.provider === 'kakao') {
                if (!payload.authorizationCode) {
                    throw new common_1.UnauthorizedException('authorizationCode is required for Kakao login');
                }
                if (!payload.codeVerifier) {
                    throw new common_1.UnauthorizedException('codeVerifier is required for Kakao PKCE login');
                }
            }
            const token = (payload.accessToken ?? payload.authorizationCode);
            const result = await this.authService.socialLoginWithCode(token, payload.provider, {
                authorizationCode: payload.authorizationCode,
                codeVerifier: payload.codeVerifier,
                redirectUri: payload.redirectUri,
            });
            // deviceToken이 제공되면 디바이스 토큰 저장
            if (payload.deviceToken && result.user?.id) {
                await this.deviceTokenService.upsertDeviceToken(result.user?.id, payload.deviceToken).catch(err => {
                    console.warn('Failed to save device token:', err.message);
                });
            }
            if (result.user?.id) {
                this.analyticsService.trackEvent('login_success', { provider: payload.provider ?? 'email' }, { userId: result.user.id }).catch(() => undefined);
            }
            return (0, api_1.success)((0, auth_response_util_1.buildAuthSessionResponse)(result), 'Login successful');
        }
        const result = await this.authService.login(payload);
        // deviceToken이 제공되면 디바이스 토큰 저장
        if (result.user?.id) {
            await this.deviceTokenService.bindPendingTokensToUser(result.user.id, payload.pendingKey, payload.deviceToken).catch(err => {
                console.warn('Failed to bind device token:', err.message);
            });
        }
        // Analytics: 로그인 성공
        if (result.user?.id) {
            this.analyticsService.trackEvent('login_success', { provider: payload.provider ?? 'email' }, { userId: result.user.id }).catch(() => undefined);
        }
        return (0, api_1.success)((0, auth_response_util_1.buildAuthSessionResponse)(result), 'Login successful');
    }
    async refresh(body) {
        const payload = authSchemas_1.refreshSchema.parse(body);
        this.logger.debug(`🔄 Token refresh attempt - refreshToken: ${payload.refreshToken?.substring(0, 20)}...`);
        const result = await this.authService.refresh(payload.refreshToken);
        return (0, api_1.success)({
            accessToken: result.tokenPair.accessToken,
            refreshToken: result.tokenPair.refreshToken,
            accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
            refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
            sessionId: result.session.sessionId,
            sessionExpiresAt: result.session.expiresAt,
            loginType: result.loginType,
        }, 'Token refreshed successfully');
    }
    async deleteAccount(req) {
        const currentUser = req.currentUser;
        if (!currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        // 최적화된 삭제 서비스 사용
        const result = await this.optimizedDeleteService.fastDeleteAccount(currentUser, req.loginType);
        return (0, api_1.success)({
            userID: currentUser.id,
            supabaseDeleted: result.supabaseDeleted,
        }, 'Account deleted successfully');
    }
    async logout(body) {
        const payload = authSchemas_1.logoutSchema.parse(body);
        const result = await this.authService.logoutBySessionId(payload.sessionId);
        return (0, api_1.success)(result, 'Logout successful');
    }
    async logoutJwt(req) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                throw new common_1.UnauthorizedException('Bearer token is required');
            }
            const token = authHeader.substring(7); // Remove 'Bearer '
            // JWT 토큰을 blacklist에 추가
            const invalidated = await this.enhancedJwtService.invalidateToken(token, 'logout');
            if (!invalidated) {
                throw new common_1.BadRequestException('Failed to invalidate token');
            }
            // 토큰에서 정보 추출 (디코딩만, 검증 X)
            const decodedToken = this.enhancedJwtService.decodeToken(token);
            const tokenId = decodedToken?.tokenId || 'unknown';
            this.logger.log(`JWT token invalidated via logout: ${tokenId} - User: ${req.currentUser?.id}`);
            return (0, api_1.success)({
                invalidated: true,
                tokenId,
                message: 'Token has been added to blacklist and is no longer valid'
            }, 'JWT token invalidated successfully');
        }
        catch (error) {
            this.logger.error(`JWT logout error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            if (error instanceof common_1.UnauthorizedException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Failed to process JWT logout');
        }
    }
    async refreshJwt(body) {
        try {
            const { refreshToken } = body;
            if (!refreshToken) {
                throw new common_1.BadRequestException('Refresh token is required');
            }
            // Enhanced JWT 서비스로 토큰 새로고침
            const newTokenPair = await this.enhancedJwtService.refreshTokens(refreshToken);
            if (!newTokenPair) {
                throw new common_1.UnauthorizedException('Invalid or expired refresh token');
            }
            this.logger.log(`JWT tokens refreshed: ${newTokenPair.tokenId}`);
            return (0, api_1.success)({
                accessToken: newTokenPair.accessToken,
                refreshToken: newTokenPair.refreshToken,
                accessTokenTTL: newTokenPair.accessTokenTTL,
                refreshTokenTTL: newTokenPair.refreshTokenTTL,
                tokenId: newTokenPair.tokenId,
            }, 'Tokens refreshed successfully');
        }
        catch (error) {
            this.logger.error(`JWT refresh error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            if (error instanceof common_1.UnauthorizedException || error instanceof common_1.BadRequestException) {
                throw error;
            }
            throw new common_1.BadRequestException('Failed to refresh tokens');
        }
    }
    async invalidateAllUserTokens(req, body) {
        try {
            const { reason = 'security' } = body;
            const userId = req.currentUser.id;
            // 사용자의 모든 토큰 무효화
            const invalidatedCount = await this.enhancedJwtService.invalidateAllUserTokens(userId, reason);
            this.logger.warn(`All tokens invalidated for user ${userId} - Count: ${invalidatedCount} - Reason: ${reason}`);
            return (0, api_1.success)({
                invalidatedCount,
                userId,
                reason,
                message: `${invalidatedCount} tokens have been invalidated`
            }, 'All user tokens invalidated successfully');
        }
        catch (error) {
            this.logger.error(`Invalidate all tokens error: ${error instanceof Error ? error.message : String(error)}`, error instanceof Error ? error.stack : undefined);
            throw new common_1.BadRequestException('Failed to invalidate tokens');
        }
    }
    async registerDeviceToken(deviceTokenRaw, pendingKeyRaw, req) {
        const startTime = Date.now();
        const deviceToken = typeof deviceTokenRaw === 'string' ? deviceTokenRaw.trim() : '';
        if (!deviceToken) {
            throw new common_1.BadRequestException('deviceToken is required');
        }
        const pendingKey = typeof pendingKeyRaw === 'string' ? pendingKeyRaw.trim() : undefined;
        const resolvedUserId = req.currentUser?.id ?? (await this.resolveUserIdFromHeader(req));
        if (!resolvedUserId && !pendingKey) {
            throw new common_1.BadRequestException('pendingKey is required for anonymous registration');
        }
        const mode = resolvedUserId ? 'authenticated' : 'anonymous';
        // 메인 작업은 백그라운드로 돌리고 최대 200ms만 대기해서 빠른 응답
        const workPromise = (async () => {
            if (resolvedUserId) {
                if (pendingKey) {
                    await this.deviceTokenService.bindPendingTokensToUser(resolvedUserId, pendingKey, deviceToken);
                }
                await this.deviceTokenService.upsertDeviceToken(resolvedUserId, deviceToken);
            }
            else {
                await this.deviceTokenService.upsertAnonymousToken(pendingKey, deviceToken);
            }
        })();
        const loggingPromise = workPromise
            .then(() => {
            this.logger.debug(`[device-token] mode=${mode} ${resolvedUserId ? `user=${resolvedUserId}` : `pendingKey=${pendingKey}`} tokenPrefix=${deviceToken.slice(0, 8)} elapsed=${Date.now() - startTime}ms`);
        })
            .catch((error) => {
            this.logger.warn(`[device-token] background work failed: ${error instanceof Error ? error.message : String(error)}`);
        });
        const quickTimeout = new Promise((resolve) => setTimeout(resolve, 200));
        await Promise.race([loggingPromise, quickTimeout]);
        return (0, api_1.success)({ deviceToken, pendingKey, mode }, 'Device token registered');
    }
    /**
     * Authorization 헤더의 Bearer 토큰이 있으면 검증하여 userId를 반환
     */
    async resolveUserIdFromHeader(req) {
        const authHeader = req.headers?.authorization ?? '';
        if (!authHeader.toLowerCase().startsWith('bearer ')) {
            return null;
        }
        const token = authHeader.slice(7).trim();
        if (!token)
            return null;
        try {
            const payload = this.jwtTokenService.verifyAccessToken(token);
            if (!payload?.sub || !payload.sessionId)
                return null;
            // 세션이 유효한지 확인 (만료/취소된 세션이면 무시)
            const session = await this.sessionService.getSession(payload.sessionId);
            if (!session?.isActive)
                return null;
            return payload.sub;
        }
        catch {
            return null;
        }
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)('signup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_decorator_1.RateLimit)({ limit: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:signup' }),
    (0, swagger_1.ApiOperation)({ summary: '사용자 회원가입' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: {
                email: { type: 'string', format: 'email', example: 'string' },
                password: { type: 'string', minLength: 6, example: 'string' },
                name: { type: 'string', example: 'string' },
                deviceToken: { type: 'string', description: 'APNS device token for push notifications', nullable: true },
                pendingKey: { type: 'string', description: 'anonymous token matching key', nullable: true },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.SignupResponseDto }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: '잘못된 요청 본문',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 400 },
                message: { type: 'string', example: 'email and password are required' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "signup", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_decorator_1.RateLimit)({ limit: 5, windowMs: 15 * 60 * 1000, keyPrefix: 'auth:login' }),
    (0, swagger_1.ApiOperation)({ summary: '로그인 (이메일/아이디 또는 소셜 accessToken/code)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                identifier: {
                    type: 'string',
                    description: '이메일 전체 또는 아이디',
                    example: 'user 또는 user@example.com',
                },
                provider: {
                    type: 'string',
                    enum: ['email', 'google', 'apple', 'kakao'],
                    description: '소셜 로그인 시 provider 지정',
                },
                accessToken: {
                    type: 'string',
                    description: '소셜 accessToken (카카오는 authorizationCode+codeVerifier 권장)',
                },
                authorizationCode: {
                    type: 'string',
                    description: '소셜 authorizationCode (카카오 필수, 애플/구글은 refresh 교환용)',
                },
                codeVerifier: {
                    type: 'string',
                    description: 'PKCE code_verifier (카카오 인가코드 교환 시 전달)',
                },
                redirectUri: {
                    type: 'string',
                    description: '카카오 인가 요청에 사용한 redirectUri (기본값과 다를 때 전달)',
                },
                email: {
                    type: 'string',
                    format: 'email',
                    description: '(선택) identifier 대신 사용할 이메일',
                    example: 'user@example.com',
                },
                password: { type: 'string', example: 'string' },
                deviceToken: { type: 'string', description: 'APNS device token for push notifications', nullable: true },
                pendingKey: { type: 'string', description: 'anonymous token matching key', nullable: true },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.LoginResponseDto }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: '이메일/패스워드 누락',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 400 },
                message: { type: 'string', example: 'email and password are required' },
            },
        },
    }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: '자격 증명 오류',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 401 },
                message: { type: 'string', example: 'Invalid credentials' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Refresh 토큰으로 Access 토큰 재발급' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: {
                refreshToken: {
                    type: 'string',
                    example: 'string',
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.RefreshResponseDto }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: 'Refresh 토큰 누락',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 400 },
                message: { type: 'string', example: 'refreshToken is required' },
            },
        },
    }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: 'Refresh 토큰 검증 실패',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 401 },
                message: { type: 'string', example: 'Invalid or expired refresh token' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '본인 계정 삭제 (Supabase 계정 포함)' }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.DeleteAccountResponseDto }),
    (0, swagger_1.ApiUnauthorizedResponse)({
        description: '인증 실패',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 401 },
                message: { type: 'string', example: 'Unauthorized' },
            },
        },
    }),
    (0, common_1.Delete)('account'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "deleteAccount", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '로그아웃 (sessionId 기반)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['sessionId'],
            properties: {
                sessionId: { type: 'string', description: '로그인 응답에서 받은 sessionId' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, common_1.Post)('logout-jwt'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: 'JWT 토큰 기반 로그아웃 (Enhanced Blacklist)',
        description: 'JWT 토큰을 blacklist에 추가하여 즉시 무효화합니다.'
    }),
    (0, swagger_1.ApiOkResponse)({
        description: '로그아웃 성공',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'JWT token invalidated successfully' },
                data: {
                    type: 'object',
                    properties: {
                        invalidated: { type: 'boolean', example: true },
                        tokenId: { type: 'string', example: 'uuid-token-id' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: '인증되지 않은 요청' }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logoutJwt", null);
__decorate([
    (0, common_1.Post)('refresh-jwt'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(rate_limit_guard_1.RateLimitGuard),
    (0, rate_limit_decorator_1.RateLimit)({ limit: 20, windowMs: 60 * 1000, keyPrefix: 'auth:refresh-jwt' }),
    (0, swagger_1.ApiOperation)({
        summary: 'JWT 토큰 새로고침 (Enhanced Blacklist)',
        description: 'Refresh token을 사용하여 새로운 Access/Refresh 토큰 쌍을 발급합니다. 기존 토큰들은 blacklist에 추가됩니다.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: {
                refreshToken: { type: 'string', description: 'Refresh Token' },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({
        description: '토큰 새로고침 성공',
        type: auth_response_dto_1.RefreshResponseDto,
    }),
    (0, swagger_1.ApiBadRequestResponse)({ description: '잘못된 요청' }),
    (0, swagger_1.ApiUnauthorizedResponse)({ description: '유효하지 않은 refresh token' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refreshJwt", null);
__decorate([
    (0, common_1.Post)('invalidate-all-tokens'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({
        summary: '사용자의 모든 JWT 토큰 무효화',
        description: '보안 사고나 계정 탈퇴 시 사용자의 모든 토큰을 blacklist에 추가하여 무효화합니다.'
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                reason: {
                    type: 'string',
                    enum: ['logout', 'security', 'admin'],
                    default: 'security',
                    description: '무효화 사유'
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({
        description: '모든 토큰 무효화 성공',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'All user tokens invalidated successfully' },
                data: {
                    type: 'object',
                    properties: {
                        invalidatedCount: { type: 'number', example: 5 },
                        userId: { type: 'string', example: 'uuid-user-id' },
                        reason: { type: 'string', example: 'security' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "invalidateAllUserTokens", null);
__decorate([
    (0, common_1.Post)('device-token'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '디바이스 토큰 등록/업데이트 (인증/비인증 모두 가능)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['deviceToken'],
            properties: {
                deviceToken: {
                    type: 'string',
                    example: 'fe13ccdb7ea3fe314f0df403383b7d5d974dd0f946cd4b89b0f1fd7523dc9a07',
                    description: 'APNS device token',
                },
                pendingKey: {
                    type: 'string',
                    example: 'anon-uuid-123',
                    description: '로그인 전 토큰 매칭용 키(비로그인 등록 시 필수)',
                    nullable: true,
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'Device token registered' },
                data: {
                    type: 'object',
                    properties: {
                        deviceToken: { type: 'string', example: 'fe13ccdb...' },
                        pendingKey: { type: 'string', example: 'anon-uuid-123', nullable: true },
                        mode: { type: 'string', example: 'anonymous', description: 'anonymous | authenticated' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)('deviceToken')),
    __param(1, (0, common_1.Body)('pendingKey')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "registerDeviceToken", null);
exports.AuthController = AuthController = AuthController_1 = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('api/v1/auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        optimized_delete_service_1.OptimizedDeleteService,
        device_token_service_1.DeviceTokenService,
        analytics_service_1.AnalyticsService,
        jwtService_1.JwtTokenService,
        sessionService_1.SessionService,
        enhanced_jwt_service_1.EnhancedJwtService,
        jwt_blacklist_service_1.JwtBlacklistService])
], AuthController);
