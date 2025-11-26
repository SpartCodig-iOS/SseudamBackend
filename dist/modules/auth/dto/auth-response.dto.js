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
exports.DeleteAccountResponseDto = exports.DeleteAccountResponseDataDto = exports.RefreshResponseDto = exports.RefreshResponseDataDto = exports.LoginResponseDto = exports.SignupResponseDto = exports.AuthSessionEnvelopeDto = exports.AuthUserDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class AuthUserDto {
}
exports.AuthUserDto = AuthUserDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123e4567-e89b-12d3-a456-426614174000' }),
    __metadata("design:type", String)
], AuthUserDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user@example.com' }),
    __metadata("design:type", String)
], AuthUserDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '홍길동', nullable: true }),
    __metadata("design:type", Object)
], AuthUserDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: null, nullable: true }),
    __metadata("design:type", Object)
], AuthUserDto.prototype, "avatarURL", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user' }),
    __metadata("design:type", String)
], AuthUserDto.prototype, "role", void 0);
class AuthSessionEnvelopeDto {
}
exports.AuthSessionEnvelopeDto = AuthSessionEnvelopeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: AuthUserDto }),
    __metadata("design:type", AuthUserDto)
], AuthSessionEnvelopeDto.prototype, "user", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "refreshToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-10T05:39:56.500Z' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "accessTokenExpiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-16T05:39:56.500Z' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "refreshTokenExpiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '16d3f6c6-8b5d-4927-b1b7-0c08d08d874f' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-12-16T05:39:56.500Z' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "sessionExpiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-14T11:52:04.000Z' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "lastLoginAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'email' }),
    __metadata("design:type", String)
], AuthSessionEnvelopeDto.prototype, "loginType", void 0);
class SignupResponseDto {
}
exports.SignupResponseDto = SignupResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], SignupResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Signup successful' }),
    __metadata("design:type", String)
], SignupResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: AuthSessionEnvelopeDto }),
    __metadata("design:type", AuthSessionEnvelopeDto)
], SignupResponseDto.prototype, "data", void 0);
class LoginResponseDto {
}
exports.LoginResponseDto = LoginResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], LoginResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Login successful' }),
    __metadata("design:type", String)
], LoginResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: AuthSessionEnvelopeDto }),
    __metadata("design:type", AuthSessionEnvelopeDto)
], LoginResponseDto.prototype, "data", void 0);
class RefreshResponseDataDto {
}
exports.RefreshResponseDataDto = RefreshResponseDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "refreshToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-10T05:39:56.500Z' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "accessTokenExpiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-16T05:39:56.500Z' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "refreshTokenExpiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '16d3f6c6-8b5d-4927-b1b7-0c08d08d874f' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "sessionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-12-16T05:39:56.500Z' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "sessionExpiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'email' }),
    __metadata("design:type", String)
], RefreshResponseDataDto.prototype, "loginType", void 0);
class RefreshResponseDto {
}
exports.RefreshResponseDto = RefreshResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], RefreshResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Token refreshed successfully' }),
    __metadata("design:type", String)
], RefreshResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: RefreshResponseDataDto }),
    __metadata("design:type", RefreshResponseDataDto)
], RefreshResponseDto.prototype, "data", void 0);
class DeleteAccountResponseDataDto {
}
exports.DeleteAccountResponseDataDto = DeleteAccountResponseDataDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123e4567-e89b-12d3-a456-426614174000' }),
    __metadata("design:type", String)
], DeleteAccountResponseDataDto.prototype, "userID", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: true }),
    __metadata("design:type", Boolean)
], DeleteAccountResponseDataDto.prototype, "supabaseDeleted", void 0);
class DeleteAccountResponseDto {
}
exports.DeleteAccountResponseDto = DeleteAccountResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 200 }),
    __metadata("design:type", Number)
], DeleteAccountResponseDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'Account deleted successfully' }),
    __metadata("design:type", String)
], DeleteAccountResponseDto.prototype, "message", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DeleteAccountResponseDataDto }),
    __metadata("design:type", DeleteAccountResponseDataDto)
], DeleteAccountResponseDto.prototype, "data", void 0);
