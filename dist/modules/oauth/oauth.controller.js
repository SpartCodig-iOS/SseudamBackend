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
const authSchemas_1 = require("../../validators/authSchemas");
const api_1 = require("../../types/api");
const auth_response_dto_1 = require("../auth/dto/auth-response.dto");
const oauth_response_dto_1 = require("./dto/oauth-response.dto");
const auth_response_util_1 = require("../auth/auth-response.util");
const auth_guard_1 = require("../../common/guards/auth.guard");
let OAuthController = class OAuthController {
    constructor(socialAuthService) {
        this.socialAuthService = socialAuthService;
    }
    async handleOAuthLogin(body, message) {
        const payload = authSchemas_1.oauthTokenSchema.parse(body);
        const result = await this.socialAuthService.loginWithOAuthToken(payload.accessToken, payload.loginType, payload.appleRefreshToken, payload.authorizationCode);
        return (0, api_1.success)((0, auth_response_util_1.buildAuthSessionResponse)(result), message);
    }
    async issueToken(body) {
        return this.handleOAuthLogin(body, 'Login successful');
    }
    async login(body) {
        return this.handleOAuthLogin(body, 'Login successful');
    }
    async lookupOAuthAccount(body) {
        const payload = authSchemas_1.oauthTokenSchema.parse(body);
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
                appleRefreshToken: {
                    type: 'string',
                    description: '애플 최초 가입 시 전달되는 refresh token',
                    nullable: true,
                },
                authorizationCode: {
                    type: 'string',
                    description: '애플 authorization_code (refresh token 교환용)',
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
                appleRefreshToken: {
                    type: 'string',
                    description: '애플 최초 가입 시 전달되는 refresh token',
                    nullable: true,
                },
                authorizationCode: {
                    type: 'string',
                    description: '애플 authorization_code (refresh token 교환용)',
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
    (0, swagger_1.ApiOperation)({ summary: '소셜/OAuth access token으로 가입 여부 확인' }),
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
exports.OAuthController = OAuthController = __decorate([
    (0, swagger_1.ApiTags)('OAuth'),
    (0, common_1.Controller)('api/v1/oauth'),
    __metadata("design:paramtypes", [social_auth_service_1.SocialAuthService])
], OAuthController);
