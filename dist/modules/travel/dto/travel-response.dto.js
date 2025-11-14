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
exports.TravelInviteResponseDto = exports.TravelMemberDto = exports.TravelSummaryDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class TravelSummaryDto {
}
exports.TravelSummaryDto = TravelSummaryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'c7d0c7f4-5e47-4f57-8a4f-7f2d08ed1234' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '도쿄 가을 여행' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-10-01' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "startDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-10-05' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "endDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'JP' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "countryCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'JPY' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "baseCurrency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0.0091 }),
    __metadata("design:type", Number)
], TravelSummaryDto.prototype, "baseExchangeRate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ab12cd34', nullable: true, required: false }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "inviteCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'owner' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-09-01T12:34:56.000Z' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '홍길동', nullable: true }),
    __metadata("design:type", Object)
], TravelSummaryDto.prototype, "ownerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => TravelMemberDto, isArray: true }),
    __metadata("design:type", Array)
], TravelSummaryDto.prototype, "members", void 0);
class TravelMemberDto {
}
exports.TravelMemberDto = TravelMemberDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '8c4c3b33-...' }),
    __metadata("design:type", String)
], TravelMemberDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '김철수', nullable: true }),
    __metadata("design:type", Object)
], TravelMemberDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'member' }),
    __metadata("design:type", String)
], TravelMemberDto.prototype, "role", void 0);
class TravelInviteResponseDto {
}
exports.TravelInviteResponseDto = TravelInviteResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'a1b2c3d4' }),
    __metadata("design:type", String)
], TravelInviteResponseDto.prototype, "inviteCode", void 0);
