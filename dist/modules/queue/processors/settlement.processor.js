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
var SettlementProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettlementProcessor = void 0;
const bull_1 = require("@nestjs/bull");
const common_1 = require("@nestjs/common");
const queue_constants_1 = require("../../../common/constants/queue.constants");
let SettlementProcessor = SettlementProcessor_1 = class SettlementProcessor {
    constructor() {
        this.logger = new common_1.Logger(SettlementProcessor_1.name);
    }
    async recalculateSettlement(job) {
        const { travelId, triggeredBy, triggerDetails } = job.data;
        try {
            this.logger.log(`🔥 [BACKGROUND] Recalculating settlement for travel ${travelId} (triggered by: ${triggeredBy})`);
            // 🚀 실제 정산 재계산 로직 (무거운 계산)
            // const result = await this.settlementService.fullRecalculate(travelId);
            // 🎯 현재는 로그만 출력 (실제 계산 로직은 기존 서비스 사용)
            this.logger.log(`📊 Settlement recalculation started for travel ${travelId}`);
            // 임시 처리 시뮬레이션 (실제로는 DB 쿼리 실행)
            await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 처리 시뮬레이션
            // 🎉 재계산 완료 후 결과 캐시 업데이트
            this.logger.log(`✅ Settlement recalculated for travel ${travelId} - expense: ${triggerDetails?.expenseId}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Failed to recalculate settlement for travel ${travelId}: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
    async updateBudgetStatus(job) {
        const { travelId, totalSpent, budget, usagePercent } = job.data;
        try {
            this.logger.log(`🔥 [BACKGROUND] Updating budget status for travel ${travelId} (${usagePercent.toFixed(1)}%)`);
            // 🚨 예산 초과 알림 로직
            if (usagePercent >= 100) {
                this.logger.warn(`🚨 Budget exceeded for travel ${travelId}: ${totalSpent}원 / ${budget}원`);
                // TODO: 예산 초과 알림 발송
                // await this.notificationService.sendBudgetExceededAlert(travelId);
            }
            else if (usagePercent >= 80) {
                this.logger.warn(`⚠️  Budget warning for travel ${travelId}: ${usagePercent.toFixed(1)}% used`);
                // TODO: 예산 경고 알림 발송
                // await this.notificationService.sendBudgetWarning(travelId, usagePercent);
            }
            // 📈 예산 상태 통계 업데이트
            this.logger.log(`📊 Budget status updated for travel ${travelId}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`❌ Failed to update budget status for travel ${travelId}: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
            throw error;
        }
    }
};
exports.SettlementProcessor = SettlementProcessor;
__decorate([
    (0, bull_1.Process)(queue_constants_1.JOB_TYPES.RECALCULATE_SETTLEMENT),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettlementProcessor.prototype, "recalculateSettlement", null);
__decorate([
    (0, bull_1.Process)(queue_constants_1.JOB_TYPES.UPDATE_BUDGET_STATUS),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], SettlementProcessor.prototype, "updateBudgetStatus", null);
exports.SettlementProcessor = SettlementProcessor = SettlementProcessor_1 = __decorate([
    (0, bull_1.Processor)(queue_constants_1.QUEUES.SETTLEMENT)
], SettlementProcessor);
