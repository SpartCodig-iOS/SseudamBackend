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
exports.TravelInviteResponseDto = exports.TravelExpenseDto = exports.TravelExpenseMemberDto = exports.TravelExpenseParticipantDto = exports.TravelMemberDto = exports.TravelListResponseDto = exports.TravelSummaryDto = void 0;
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
    (0, swagger_1.ApiProperty)({ example: '일본', nullable: true, required: false }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "countryNameKr", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: ['JPY'], description: '여행 국가에서 사용하는 통화 리스트 (ISO 4217 코드)' }),
    __metadata("design:type", Array)
], TravelSummaryDto.prototype, "countryCurrencies", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'JPY' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "baseCurrency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'JPY', description: '여행지 통화 코드(국가 코드 기반)' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "destinationCurrency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 0.0091 }),
    __metadata("design:type", Number)
], TravelSummaryDto.prototype, "baseExchangeRate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 50000000, nullable: true, required: false, description: '여행 예산 (minor units, 예: 센트, 원)' }),
    __metadata("design:type", Number)
], TravelSummaryDto.prototype, "budget", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'KRW', nullable: true, required: false, description: '예산 통화 (ISO 4217 코드)' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "budgetCurrency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'ab12cd34', nullable: true, required: false }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "inviteCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://sseudam.up.railway.app/deeplink?inviteCode=ab12cd34', nullable: true, required: false }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "deepLink", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'active' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-09-01T12:34:56.000Z' }),
    __metadata("design:type", String)
], TravelSummaryDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '홍길동', nullable: true }),
    __metadata("design:type", Object)
], TravelSummaryDto.prototype, "ownerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => TravelMemberDto, isArray: true, required: false }),
    __metadata("design:type", Array)
], TravelSummaryDto.prototype, "members", void 0);
class TravelListResponseDto {
}
exports.TravelListResponseDto = TravelListResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 42 }),
    __metadata("design:type", Number)
], TravelListResponseDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 1 }),
    __metadata("design:type", Number)
], TravelListResponseDto.prototype, "page", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 20 }),
    __metadata("design:type", Number)
], TravelListResponseDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => TravelSummaryDto, isArray: true }),
    __metadata("design:type", Array)
], TravelListResponseDto.prototype, "items", void 0);
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
    (0, swagger_1.ApiProperty)({ example: 'user@example.com', nullable: true }),
    __metadata("design:type", Object)
], TravelMemberDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://example.com/avatar.png', nullable: true }),
    __metadata("design:type", Object)
], TravelMemberDto.prototype, "avatarUrl", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'member' }),
    __metadata("design:type", String)
], TravelMemberDto.prototype, "role", void 0);
class TravelExpenseParticipantDto {
}
exports.TravelExpenseParticipantDto = TravelExpenseParticipantDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '8c4c3b33-...' }),
    __metadata("design:type", String)
], TravelExpenseParticipantDto.prototype, "memberId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '김철수', nullable: true }),
    __metadata("design:type", Object)
], TravelExpenseParticipantDto.prototype, "name", void 0);
class TravelExpenseMemberDto {
}
exports.TravelExpenseMemberDto = TravelExpenseMemberDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '8c4c3b33-...' }),
    __metadata("design:type", String)
], TravelExpenseMemberDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '김철수', nullable: true }),
    __metadata("design:type", Object)
], TravelExpenseMemberDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'user@example.com', nullable: true }),
    __metadata("design:type", Object)
], TravelExpenseMemberDto.prototype, "email", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://example.com/avatar.png', nullable: true }),
    __metadata("design:type", Object)
], TravelExpenseMemberDto.prototype, "avatarUrl", void 0);
class TravelExpenseDto {
}
exports.TravelExpenseDto = TravelExpenseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'd1a2e3f4-...' }),
    __metadata("design:type", String)
], TravelExpenseDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '라멘 식사' }),
    __metadata("design:type", String)
], TravelExpenseDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '신주쿠역 인근' }),
    __metadata("design:type", Object)
], TravelExpenseDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 3500 }),
    __metadata("design:type", Number)
], TravelExpenseDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'JPY' }),
    __metadata("design:type", String)
], TravelExpenseDto.prototype, "currency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 35200 }),
    __metadata("design:type", Number)
], TravelExpenseDto.prototype, "convertedAmount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-17' }),
    __metadata("design:type", String)
], TravelExpenseDto.prototype, "expenseDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        example: 'food_and_drink',
        nullable: true,
        enum: ['accommodation', 'food_and_drink', 'transportation', 'activity', 'shopping', 'other'],
        description: '지출 카테고리',
    }),
    __metadata("design:type", Object)
], TravelExpenseDto.prototype, "category", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'e11cc73b-052d-4740-8213-999c05bfc332' }),
    __metadata("design:type", String)
], TravelExpenseDto.prototype, "authorId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'owner', required: false, description: '결제자 ID (생성/수정 응답에서는 포함될 수 있음)' }),
    __metadata("design:type", String)
], TravelExpenseDto.prototype, "payerId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '홍길동', nullable: true }),
    __metadata("design:type", Object)
], TravelExpenseDto.prototype, "payerName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => TravelExpenseMemberDto,
        nullable: true,
        required: false,
        description: '결제자 상세 정보 (목록 응답에서 주로 반환)',
    }),
    __metadata("design:type", Object)
], TravelExpenseDto.prototype, "payer", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => TravelExpenseParticipantDto, isArray: true }),
    __metadata("design:type", Array)
], TravelExpenseDto.prototype, "participants", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({
        type: () => TravelExpenseMemberDto,
        isArray: true,
        required: false,
        description: '해당 여행의 전체 멤버 (목록 응답에서 주로 반환)',
    }),
    __metadata("design:type", Array)
], TravelExpenseDto.prototype, "expenseMembers", void 0);
class TravelInviteResponseDto {
}
exports.TravelInviteResponseDto = TravelInviteResponseDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'a1b2c3d4' }),
    __metadata("design:type", String)
], TravelInviteResponseDto.prototype, "inviteCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'https://sseudam.up.railway.app/deeplink?inviteCode=a1b2c3d4' }),
    __metadata("design:type", String)
], TravelInviteResponseDto.prototype, "deepLink", void 0);
