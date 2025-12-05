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
let AuthController = class AuthController {
    constructor(authService, optimizedDeleteService) {
        this.authService = authService;
        this.optimizedDeleteService = optimizedDeleteService;
    }
    async signup(body) {
        const payload = authSchemas_1.signupSchema.parse(body);
        const result = await this.authService.signup(payload);
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
            return (0, api_1.success)((0, auth_response_util_1.buildAuthSessionResponse)(result), 'Login successful');
        }
        const result = await this.authService.login(payload);
        return (0, api_1.success)((0, auth_response_util_1.buildAuthSessionResponse)(result), 'Login successful');
    }
    async refresh(body) {
        const payload = authSchemas_1.refreshSchema.parse(body);
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
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)('api/v1/auth'),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        optimized_delete_service_1.OptimizedDeleteService])
], AuthController);
