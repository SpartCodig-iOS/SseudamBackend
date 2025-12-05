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
exports.OAuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const social_auth_service_1 = require("./social-auth.service");
const optimized_oauth_service_1 = require("./optimized-oauth.service");
const authSchemas_1 = require("../../validators/authSchemas");
const api_1 = require("../../types/api");
const auth_response_dto_1 = require("../auth/dto/auth-response.dto");
const oauth_response_dto_1 = require("./dto/oauth-response.dto");
const auth_response_util_1 = require("../auth/auth-response.util");
const auth_guard_1 = require("../../common/guards/auth.guard");
const cacheService_1 = require("../../services/cacheService");
const crypto_1 = require("crypto");
let OAuthController = class OAuthController {
    constructor(socialAuthService, optimizedOAuthService, cacheService) {
        this.socialAuthService = socialAuthService;
        this.optimizedOAuthService = optimizedOAuthService;
        this.cacheService = cacheService;
    }
    async handleOAuthLogin(body, message) {
        const payload = authSchemas_1.oauthTokenSchema.parse(body);
        // 최적화된 OAuth 서비스 사용
        const result = await this.optimizedOAuthService.fastOAuthLogin(payload.accessToken, payload.loginType, {
            appleRefreshToken: payload.appleRefreshToken,
            googleRefreshToken: payload.googleRefreshToken,
            authorizationCode: payload.authorizationCode,
            codeVerifier: payload.codeVerifier,
            redirectUri: payload.redirectUri,
        });
        return (0, api_1.success)((0, auth_response_util_1.buildLightweightAuthResponse)(result), message);
    }
    async issueToken(body) {
        return this.handleOAuthLogin(body, 'Signup successful');
    }
    async login(body) {
        return this.handleOAuthLogin(body, 'Login successful');
    }
    async lookupOAuthAccount(body) {
        const payload = authSchemas_1.oauthTokenSchema.parse(body);
        if (payload.loginType === 'kakao' && payload.authorizationCode) {
            const result = await this.socialAuthService.checkKakaoAccountWithCode(payload.authorizationCode, {
                codeVerifier: payload.codeVerifier,
                redirectUri: payload.redirectUri,
            });
            return (0, api_1.success)(result, 'Lookup successful');
        }
        const result = await this.socialAuthService.checkOAuthAccount(payload.accessToken, payload.loginType);
        return (0, api_1.success)(result, 'Lookup successful');
    }
    async revokeApple(body, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = authSchemas_1.appleRevokeSchema.parse(body);
        await this.socialAuthService.revokeAppleConnection(req.currentUser.id, payload.refreshToken);
        return (0, api_1.success)({}, 'Apple connection revoked');
    }
    async kakaoCallback(code, state, redirectUriQuery) {
        if (!code) {
            throw new common_1.BadRequestException('Missing authorization code');
        }
        let codeVerifier;
        let redirectUri = redirectUriQuery;
        if (state) {
            try {
                const decoded = Buffer.from(state.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
                const parsed = JSON.parse(decoded);
                codeVerifier = parsed.codeVerifier ?? parsed.code_verifier;
                redirectUri = parsed.redirectUri ?? parsed.redirect_uri ?? redirectUri;
            }
            catch {
                codeVerifier = state;
            }
        }
        const result = await this.optimizedOAuthService.fastOAuthLogin(code, 'kakao', {
            authorizationCode: code,
            codeVerifier,
            redirectUri,
        });
        // 1회용 티켓 생성 후 딥링크로 리다이렉트
        const ticket = (0, crypto_1.randomBytes)(32).toString('hex');
        const ticketTtl = 180; // 3분
        await this.cacheService.set(ticket, (0, auth_response_util_1.buildAuthSessionResponse)(result), { ttl: ticketTtl, prefix: 'kakao:ticket' });
        const redirectUrl = `sseudam://oauth/kakao?ticket=${ticket}`;
        return {
            statusCode: common_1.HttpStatus.FOUND,
            headers: { Location: redirectUrl },
            body: '',
        };
    }
    async finalizeKakaoTicket(ticket) {
        if (!ticket) {
            throw new common_1.BadRequestException('ticket is required');
        }
        const payload = await this.cacheService.get(ticket, { prefix: 'kakao:ticket' });
        await this.cacheService.del(ticket, { prefix: 'kakao:ticket' }); // 재사용 방지
        if (!payload) {
            throw new common_1.BadRequestException('ticket is expired or invalid');
        }
        return (0, api_1.success)(payload, 'Login successful');
    }
};
exports.OAuthController = OAuthController;
__decorate([
    (0, common_1.Post)('signup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '소셜 OAuth 회원가입 (access token → 서버 JWT)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['accessToken'],
            properties: {
                accessToken: { type: 'string', description: 'Supabase access token (JWT)' },
                loginType: {
                    type: 'string',
                    description: '로그인 타입 (기본값 email)',
                    example: 'apple',
                    nullable: true,
                },
                authorizationCode: {
                    type: 'string',
                    description: '애플/구글 authorization_code (refresh token 교환용)',
                    nullable: true,
                },
                codeVerifier: {
                    type: 'string',
                    description: 'PKCE code_verifier (카카오 인가 코드 교환 시 필요)',
                    nullable: true,
                },
                redirectUri: {
                    type: 'string',
                    description: '인가 요청에 사용한 redirectUri (카카오 커스텀 스킴 등)',
                    nullable: true,
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.LoginResponseDto }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: 'accessToken 누락',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 400 },
                message: { type: 'string', example: 'accessToken is required' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "issueToken", null);
__decorate([
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '소셜/OAuth access token으로 로그인' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['accessToken'],
            properties: {
                accessToken: { type: 'string', description: 'Supabase access token (JWT)' },
                loginType: {
                    type: 'string',
                    description: '로그인 타입 (기본값 email)',
                    example: 'apple',
                    nullable: true,
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: auth_response_dto_1.LoginResponseDto }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: 'accessToken 누락',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 400 },
                message: { type: 'string', example: 'accessToken is required' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('lookup'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '소셜/OAuth access token으로 가입 여부 확인 (최적화)' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['accessToken'],
            properties: {
                accessToken: { type: 'string', description: 'Supabase access token (JWT)' },
                loginType: {
                    type: 'string',
                    description: '로그인 타입 (기본값 email)',
                    example: 'apple',
                    nullable: true,
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: oauth_response_dto_1.SocialLookupResponseDto }),
    (0, swagger_1.ApiBadRequestResponse)({
        description: 'accessToken 누락',
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 400 },
                message: { type: 'string', example: 'accessToken is required' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "lookupOAuthAccount", null);
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)('apple/revoke'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '애플 OAuth 연결 해제' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['refreshToken'],
            properties: {
                refreshToken: { type: 'string', description: 'Apple refresh token (user-specific)' },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                code: { type: 'integer', example: 200 },
                message: { type: 'string', example: 'Apple connection revoked' },
                data: { type: 'object', example: {} },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "revokeApple", null);
__decorate([
    (0, common_1.Get)('kakao/callback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Kakao OAuth callback (code/state → token exchange)' }),
    __param(0, (0, common_1.Query)('code')),
    __param(1, (0, common_1.Query)('state')),
    __param(2, (0, common_1.Query)('redirect_uri')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "kakaoCallback", null);
__decorate([
    (0, common_1.Post)('kakao/finalize'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Kakao OAuth 티켓 → 최종 토큰 교환' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: ['ticket'],
            properties: {
                ticket: { type: 'string', description: '콜백에서 받은 1회용 티켓' },
            },
        },
    }),
    __param(0, (0, common_1.Body)('ticket')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], OAuthController.prototype, "finalizeKakaoTicket", null);
exports.OAuthController = OAuthController = __decorate([
    (0, swagger_1.ApiTags)('OAuth'),
    (0, common_1.Controller)('api/v1/oauth'),
    __metadata("design:paramtypes", [social_auth_service_1.SocialAuthService,
        optimized_oauth_service_1.OptimizedOAuthService,
        cacheService_1.CacheService])
], OAuthController);
