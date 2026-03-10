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
    async saveComputed(travelId, req, idempotencyKey) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const summary = await this.travelSettlementService.saveComputedSettlements(travelId, req.currentUser.id, { idempotencyKey: idempotencyKey ?? undefined });
        return (0, api_1.success)(summary);
    }
    async markComplete(travelId, settlementId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const summary = await this.travelSettlementService.markSettlementCompleted(travelId, req.currentUser.id, settlementId);
        return (0, api_1.success)(summary);
    }
    async getStatistics(travelId, req) {
        if (!req.currentUser) {
            throw new common_1.UnauthorizedException('Unauthorized');
        }
        const statistics = await this.travelSettlementService.getSettlementStatistics(travelId, req.currentUser.id);
        return (0, api_1.success)(statistics);
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
    (0, common_1.Post)('compute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '정산 계산 결과 저장 (낙관적 락 + 멱등성 보장)',
        description: 'Idempotency-Key 헤더를 제공하면 동일 키의 중복 요청을 막아 줍니다. ' +
            '두 사용자가 동시에 요청할 경우 두 번째 요청은 409 Conflict를 반환합니다.',
    }),
    (0, swagger_1.ApiHeader)({
        name: 'Idempotency-Key',
        description: '클라이언트가 생성한 UUID — 동일 키로 재요청 시 캐시된 결과 반환',
        required: false,
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_settlement_dto_1.TravelSettlementDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Headers)('Idempotency-Key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "saveComputed", null);
__decorate([
    (0, common_1.Patch)(':settlementId/complete'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '특정 정산 완료 처리 (낙관적 락 — 동시 수정 방지)',
        description: '이미 완료 상태인 항목은 재처리 없이 현재 정산 요약을 반환합니다 (멱등성). ' +
            '다른 사용자가 동시에 같은 항목을 수정하면 409 Conflict를 반환합니다.',
    }),
    (0, swagger_1.ApiOkResponse)({ type: travel_settlement_dto_1.TravelSettlementDto }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Param)('settlementId')),
    __param(2, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "markComplete", null);
__decorate([
    (0, common_1.Get)('statistics'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '정산 통계 조회 - 총 내역, 내가 쓴 금액, 모든 멤버의 받을/줄 금액',
    }),
    (0, swagger_1.ApiOkResponse)({
        schema: {
            type: 'object',
            properties: {
                code: { type: 'number', example: 200 },
                message: { type: 'string', example: 'success' },
                data: {
                    type: 'object',
                    properties: {
                        totalExpenseAmount: { type: 'number', example: 150000 },
                        myPaidAmount: { type: 'number', example: 80000 },
                        mySharedAmount: { type: 'number', example: 75000 },
                        myBalance: { type: 'number', example: 5000 },
                        balanceStatus: {
                            type: 'string',
                            enum: ['receive', 'pay', 'settled'],
                            example: 'receive',
                        },
                        memberBalances: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    memberId: { type: 'string' },
                                    memberName: { type: 'string' },
                                    balance: { type: 'number' },
                                    balanceStatus: {
                                        type: 'string',
                                        enum: ['receive', 'pay', 'settled'],
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Param)('travelId')),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], TravelSettlementController.prototype, "getStatistics", null);
exports.TravelSettlementController = TravelSettlementController = __decorate([
    (0, swagger_1.ApiTags)('Travel Settlements'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.UseGuards)(auth_guard_1.AuthGuard),
    (0, common_1.Controller)('api/v1/travels/:travelId/settlements'),
    __metadata("design:paramtypes", [travel_settlement_service_1.TravelSettlementService])
], TravelSettlementController);
