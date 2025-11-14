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
class SessionResponseDto {
}
exports.SessionResponseDto = SessionResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '16d3f6c6-...' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '5815702d-...' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'email' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "loginType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-15T10:00:00.000Z' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-20T10:00:00.000Z' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "lastSeenAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-12-15T10:00:00.000Z' }),
    __metadata("design:type", String)
], SessionResponseDto.prototype, "expiresAt", void 0);
