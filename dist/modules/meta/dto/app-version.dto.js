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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppVersionDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AppVersionDto {
}
exports.AppVersionDto = AppVersionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'com.example.myapp' }),
    __metadata("design:type", String)
], AppVersionDto.prototype, "bundleId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.2.3' }),
    __metadata("design:type", String)
], AppVersionDto.prototype, "latestVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '버그 수정 및 성능 개선', nullable: true }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "releaseNotes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'MyApp', nullable: true }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "trackName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '15.0', nullable: true }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "minimumOsVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-01-15T00:00:00Z', nullable: true }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "lastUpdated", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.0.0', nullable: true, description: '서버가 요구하는 최소 지원 버전' }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "minSupportedVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: false, description: '강제 업데이트 여부 (서버 설정값)' }),
    __metadata("design:type", Boolean)
], AppVersionDto.prototype, "forceUpdate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '1.1.0', nullable: true, description: '클라이언트가 보고한 현재 버전' }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "currentVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true, description: '현재 버전이 최신 버전보다 낮은 경우' }),
    __metadata("design:type", Boolean)
], AppVersionDto.prototype, "shouldUpdate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: '최신 버전이 나왔습니다. 앱스토어에서 업데이트 해주세요!',
        nullable: true,
        description: '업데이트 안내 메시지 (업데이트 필요 시에만 제공)',
    }),
    __metadata("design:type", Object)
], AppVersionDto.prototype, "message", void 0);
