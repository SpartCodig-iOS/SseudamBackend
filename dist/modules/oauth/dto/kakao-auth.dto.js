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
exports.KakaoAuthResponseDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class KakaoAuthResponseDto {
}
exports.KakaoAuthResponseDto = KakaoAuthResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user-id-from-kakao' }),
    __metadata("design:type", String)
], KakaoAuthResponseDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'access-token' }),
    __metadata("design:type", String)
], KakaoAuthResponseDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'refresh-token' }),
    __metadata("design:type", String)
], KakaoAuthResponseDto.prototype, "refreshToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Bearer' }),
    __metadata("design:type", String)
], KakaoAuthResponseDto.prototype, "tokenType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: new Date().toISOString() }),
    __metadata("design:type", String)
], KakaoAuthResponseDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: new Date().toISOString() }),
    __metadata("design:type", String)
], KakaoAuthResponseDto.prototype, "refreshExpiresAt", void 0);
