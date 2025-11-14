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
let ProfileController = class ProfileController {
    constructor(profileService) {
        this.profileService = profileService;
    }
    async getProfile(req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const dbProfile = await this.profileService.getProfile(req.currentUser.id);
        const profileData = dbProfile
            ? {
                ...(0, mappers_1.toProfileResponse)(dbProfile),
                loginType: req.loginType ?? 'email',
            }
            : {
                ...(0, mappers_1.toProfileResponse)(req.currentUser),
                loginType: req.loginType ?? 'email',
            };
        return (0, api_1.success)(profileData);
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
    (0, swagger_1.ApiOperation)({ summary: '현재 사용자 프로필 조회' }),
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
    (0, swagger_1.ApiOperation)({ summary: '현재 사용자 프로필 수정' }),
    (0, swagger_1.ApiConsumes)('multipart/form-data'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('avatar')),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                name: { type: 'string', example: '김코드', nullable: true },
                avatar: {
                    type: 'string',
                    format: 'binary',
                    description: '업로드할 이미지 파일 (선택)',
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
