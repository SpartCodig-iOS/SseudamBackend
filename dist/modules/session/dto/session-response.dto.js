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
exports.SessionResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SessionDataDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'email' }),
    __metadata("design:type", String)
], SessionDataDto.prototype, "loginType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-08T20:39:05.084Z', nullable: true }),
    __metadata("design:type", Object)
], SessionDataDto.prototype, "lastLoginAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'f22fc114-8dc4-4b0a-a77a-559e2abbad80' }),
    __metadata("design:type", String)
], SessionDataDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'testuser@example.com' }),
    __metadata("design:type", String)
], SessionDataDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'c46760962b6433f148963bd6645d1b6e5c342a41178dbfc66cfb75aa8bb03c48' }),
    __metadata("design:type", String)
], SessionDataDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-09T05:55:28.259Z' }),
    __metadata("design:type", String)
], SessionDataDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-10T05:55:28.259Z' }),
    __metadata("design:type", String)
], SessionDataDto.prototype, "expiresAt", void 0);
class SessionResponseDto {
}
exports.SessionResponseDto = SessionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], SessionResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Session info retrieved successfully' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: SessionDataDto }),
    __metadata("design:type", SessionDataDto)
], SessionResponseDto.prototype, "data", void 0);
