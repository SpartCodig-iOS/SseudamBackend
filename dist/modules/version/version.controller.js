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
exports.VersionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const api_1 = require("../../types/api");
const version_service_1 = require("./version.service");
const app_version_dto_1 = require("./dto/app-version.dto");
let VersionController = class VersionController {
    constructor(versionService) {
        this.versionService = versionService;
    }
    async getAppVersion(bundleId, currentVersion, forceUpdateRaw) {
        let forceOverride;
        if (typeof forceUpdateRaw !== 'undefined') {
            const normalized = String(forceUpdateRaw).toLowerCase();
            if (['true', '1'].includes(normalized)) {
                forceOverride = true;
            }
            else if (['false', '0'].includes(normalized)) {
                forceOverride = false;
            }
            else {
                throw new common_1.BadRequestException("forceUpdate는 true/false 또는 1/0 값만 허용됩니다.");
            }
        }
        const version = await this.versionService.getAppVersion(bundleId, currentVersion, forceOverride);
        return (0, api_1.success)(version);
    }
};
exports.VersionController = VersionController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '앱 버전 조회 (App Store / bundleId 쿼리, 기본 APPLE_CLIENT_ID)' }),
    (0, swagger_1.ApiOkResponse)({ type: app_version_dto_1.AppVersionDto }),
    (0, swagger_1.ApiQuery)({
        name: 'forceUpdate',
        required: false,
        schema: { type: 'boolean' },
        description: '강제 업데이트 플래그를 강제로 지정 (없으면 서버/최소버전 규칙 사용)',
    }),
    __param(0, (0, common_1.Query)('bundleId')),
    __param(1, (0, common_1.Query)('currentVersion')),
    __param(2, (0, common_1.Query)('forceUpdate')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], VersionController.prototype, "getAppVersion", null);
exports.VersionController = VersionController = __decorate([
    (0, swagger_1.ApiTags)('Version'),
    (0, common_1.Controller)('api/v1/version'),
    __metadata("design:paramtypes", [version_service_1.VersionService])
], VersionController);
