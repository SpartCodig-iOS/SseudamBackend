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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TravelSettlementController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const auth_guard_1 = require("../../common/guards/auth.guard");
const api_1 = require("../../types/api");
const travel_settlement_service_1 = require("./travel-settlement.service");
const travel_settlement_dto_1 = require("./dto/travel-settlement.dto");
let TravelSettlementController = class TravelSettlementController {
    constructor(travelSettlementService) {
        this.travelSettlementService = travelSettlementService;
    }
    async getSummary(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const summary = await this.travelSettlementService.getSettlementSummary(travelId, req.currentUser.id);
        return (0, api_1.success)(summary);
    }
    async getStatistics(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const statistics = await this.travelSettlementService.getSettlementStatistics(travelId, req.currentUser.id);
        return (0, api_1.success)(statistics);
    }
    async saveSettlements(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const summary = await this.travelSettlementService.saveComputedSettlements(travelId, req.currentUser.id);
        return (0, api_1.success)(summary, 'Settlements saved');
    }
    async completeSettlement(travelId, settlementId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const summary = await this.travelSettlementService.markSettlementCompleted(travelId, req.currentUser.id, settlementId);
        return (0, api_1.success)(summary, 'Settlement completed');
    }
};
exports.TravelSettlementController = TravelSettlementController;
__decorate([
    (0, common_1.Get)(),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '정산 요약 조회' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_settlement_dto_1.TravelSettlementDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "getSummary", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '정산 통계 조회 - 총 내역, 내가 쓴 금액, 모든 멤버의 받을/줄 금액' }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'success' },
                data: {
                    type: 'object',
                    properties: {
                        totalExpenseAmount: { type: 'number', description: '총 지출 금액 (KRW)', example: 150000 },
                        myPaidAmount: { type: 'number', description: '내가 지출한 금액 (KRW)', example: 80000 },
                        mySharedAmount: { type: 'number', description: '내가 부담해야 할 금액 (KRW)', example: 75000 },
                        myBalance: { type: 'number', description: '내 잔액 (양수: 받을 금액, 음수: 줄 금액)', example: 5000 },
                        balanceStatus: { type: 'string', enum: ['receive', 'pay', 'settled'], description: '잔액 상태', example: 'receive' },
                        memberBalances: {
                            type: 'array',
                            description: '모든 여행 멤버의 잔액 정보',
                            items: {
                                type: 'object',
                                properties: {
                                    memberId: { type: 'string', description: '멤버 ID', example: 'e11c473b-052d-4740-8213-999c05bfc332' },
                                    memberName: { type: 'string', description: '멤버 이름', example: '홍길동' },
                                    balance: { type: 'number', description: '잔액 (양수: 받을 금액, 음수: 줄 금액)', example: -5000 },
                                    balanceStatus: { type: 'string', enum: ['receive', 'pay', 'settled'], description: '잔액 상태', example: 'pay' }
                                }
                            }
                        }
                    }
                }
            }
        }
    }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "getStatistics", null);
__decorate([
    (0, common_1.Post)('save'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '정산 추천 결과 저장' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_settlement_dto_1.TravelSettlementDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "saveSettlements", null);
__decorate([
    (0, common_1.Patch)(':settlementId/complete'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '정산 완료 처리' }),
    (0, common_1.Patch)(':settlementId/complete'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: '정산 완료 처리' }),
    (0, swagger_1.ApiOkResponse)({ type: travel_settlement_dto_1.TravelSettlementDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Param)('settlementId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "completeSettlement", null);
exports.TravelSettlementController = TravelSettlementController = __decorate([
    (0, swagger_1.ApiTags)('Travel Settlements'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)('api/v1/travels/:travelId/settlements'),
    __metadata("design:paramtypes", [travel_settlement_service_1.TravelSettlementService])
], TravelSettlementController);
