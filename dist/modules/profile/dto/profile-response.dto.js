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
exports.ProfileResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ProfileDataDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: '60be2b70-65cf-4a90-a188-c8f967e1cbe7' }),
    __metadata("design:type", String)
], ProfileDataDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'test@example.com' }),
    __metadata("design:type", String)
], ProfileDataDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '테스트 사용자', nullable: true }),
    __metadata("design:type", Object)
], ProfileDataDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, nullable: true }),
    __metadata("design:type", Object)
], ProfileDataDto.prototype, "avatarURL", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-07T20:43:21.842Z', nullable: true }),
    __metadata("design:type", Object)
], ProfileDataDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-07T20:43:21.842Z', nullable: true }),
    __metadata("design:type", Object)
], ProfileDataDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user' }),
    __metadata("design:type", String)
], ProfileDataDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'email' }),
    __metadata("design:type", String)
], ProfileDataDto.prototype, "loginType", void 0);
class ProfileResponseDto {
}
exports.ProfileResponseDto = ProfileResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], ProfileResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'OK' }),
    __metadata("design:type", String)
], ProfileResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: ProfileDataDto }),
    __metadata("design:type", ProfileDataDto)
], ProfileResponseDto.prototype, "data", void 0);
