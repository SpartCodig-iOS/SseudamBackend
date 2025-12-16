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
exports.ProfileController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
require("multer");
const auth_guard_1 = require("../../common/guards/auth.guard");
const api_1 = require("../../types/api");
const mappers_1 = require("../../utils/mappers");
const profile_response_dto_1 = require("./dto/profile-response.dto");
const profileSchemas_1 = require("../../validators/profileSchemas");
const profile_service_1 = require("./profile.service");
const platform_express_1 = require("@nestjs/platform-express");
const formatDate = (value) => {
    if (!value)
        return null;
    const date = typeof value === 'string' ? new Date(value) : value;
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
let ProfileController = class ProfileController {
    constructor(profileService) {
        this.profileService = profileService;
    }
    async getProfile(req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        // 🚀 FAST: 프로필 빠른 조회 (캐시 우선)
        const profile = await this.profileService.getProfileQuick(req.currentUser.id, req.currentUser);
        // 🚀 FAST: 캐시 우선, 짧은 타임아웃으로 첫 로딩 지원
        let resolvedAvatar = profile.avatar_url ?? req.currentUser.avatar_url ?? null;
        // 아바타가 없을 때만 빠른 스토리지 조회 (100ms 초단축 타임아웃)
        if (!resolvedAvatar) {
            try {
                resolvedAvatar = await this.profileService.fetchAvatarWithTimeout(profile.id, 100);
            }
            catch {
                // 실패시 백그라운드 워밍
                void this.profileService.warmAvatarFromStorage(profile.id);
            }
        }
        return (0, api_1.success)({
            id: profile.id,
            userId: profile.username || profile.email?.split('@')[0] || req.currentUser.username || 'user',
            email: profile.email || '',
            name: profile.name,
            avatarURL: resolvedAvatar, // 🚀 빠른 아바타 (캐시 우선)
            role: profile.role || req.currentUser.role || 'user',
            createdAt: formatDate(profile.created_at),
            updatedAt: formatDate(profile.updated_at),
            loginType: req.loginType ?? 'email'
        });
    }
    async updateProfile(body, file, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const payload = profileSchemas_1.updateProfileSchema.parse(body);
        const updated = await this.profileService.updateProfile(req.currentUser.id, payload, file);
        return (0, api_1.success)((0, mappers_1.toProfileResponse)(updated), 'Profile updated');
    }
};
exports.ProfileController = ProfileController;
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Get)('me'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '🚀 FAST: 현재 사용자 프로필 조회 (캐시 최적화)' }),
    (0, swagger_1.ApiOkResponse)({ type: profile_response_dto_1.ProfileResponseDto }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "getProfile", null);
__decorate([
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Patch)('me'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: '현재 사용자 프로필 수정 (이미지 자동 최적화)' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar')),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            required: [],
            properties: {
                name: { type: 'string', example: '김코드', nullable: true, description: '선택 입력' },
                avatar: {
                    type: 'string',
                    format: 'binary',
                    description: '업로드할 이미지 파일 (자동 압축 및 리사이징)',
                },
            },
        },
    }),
    (0, swagger_1.ApiOkResponse)({ type: profile_response_dto_1.ProfileResponseDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.UploadedFile)()),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], ProfileController.prototype, "updateProfile", null);
exports.ProfileController = ProfileController = __decorate([
    (0, swagger_1.ApiTags)('Profile'),
    (0, common_1.Controller)('api/v1/profile'),
    __metadata("design:paramtypes", [profile_service_1.ProfileService])
], ProfileController);
