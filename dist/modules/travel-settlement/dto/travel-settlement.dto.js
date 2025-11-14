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
exports.TravelSettlementDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class SettlementEntryDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'computed-0' }),
    __metadata("design:type", String)
], SettlementEntryDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '홍길동' }),
    __metadata("design:type", String)
], SettlementEntryDto.prototype, "fromMember", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '김철수' }),
    __metadata("design:type", String)
], SettlementEntryDto.prototype, "toMember", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 35000 }),
    __metadata("design:type", Number)
], SettlementEntryDto.prototype, "amount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'pending', enum: ['pending', 'completed'] }),
    __metadata("design:type", String)
], SettlementEntryDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2025-11-14T12:00:00.000Z' }),
    __metadata("design:type", String)
], SettlementEntryDto.prototype, "updatedAt", void 0);
class BalanceEntryDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'member-id' }),
    __metadata("design:type", String)
], BalanceEntryDto.prototype, "memberId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '홍길동', nullable: true }),
    __metadata("design:type", Object)
], BalanceEntryDto.prototype, "name", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 12000 }),
    __metadata("design:type", Number)
], BalanceEntryDto.prototype, "balance", void 0);
class TravelSettlementDto {
}
exports.TravelSettlementDto = TravelSettlementDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => BalanceEntryDto, isArray: true }),
    __metadata("design:type", Array)
], TravelSettlementDto.prototype, "balances", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => SettlementEntryDto, isArray: true }),
    __metadata("design:type", Array)
], TravelSettlementDto.prototype, "savedSettlements", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: () => SettlementEntryDto, isArray: true }),
    __metadata("design:type", Array)
], TravelSettlementDto.prototype, "recommendedSettlements", void 0);
