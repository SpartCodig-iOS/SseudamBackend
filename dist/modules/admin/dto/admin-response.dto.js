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
exports.UpdateUserRoleResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class UpdateUserRoleDataDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: '60be2b70-65cf-4a90-a188-c8f967e1cbe7' }),
    __metadata("design:type", String)
], UpdateUserRoleDataDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin@example.com' }),
    __metadata("design:type", String)
], UpdateUserRoleDataDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '운영자', nullable: true }),
    __metadata("design:type", Object)
], UpdateUserRoleDataDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, nullable: true }),
    __metadata("design:type", Object)
], UpdateUserRoleDataDto.prototype, "avatarURL", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'owner' }),
    __metadata("design:type", String)
], UpdateUserRoleDataDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'admin_user' }),
    __metadata("design:type", String)
], UpdateUserRoleDataDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-07T20:43:21.842Z', nullable: true }),
    __metadata("design:type", Object)
], UpdateUserRoleDataDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '8e922b44-7a3b-495a-bbe8-59484596c70b' }),
    __metadata("design:type", String)
], UpdateUserRoleDataDto.prototype, "changedBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '신규 운영자 지정', nullable: true }),
    __metadata("design:type", Object)
], UpdateUserRoleDataDto.prototype, "reason", void 0);
class UpdateUserRoleResponseDto {
}
exports.UpdateUserRoleResponseDto = UpdateUserRoleResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], UpdateUserRoleResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Role updated' }),
    __metadata("design:type", String)
], UpdateUserRoleResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: UpdateUserRoleDataDto }),
    __metadata("design:type", UpdateUserRoleDataDto)
], UpdateUserRoleResponseDto.prototype, "data", void 0);
