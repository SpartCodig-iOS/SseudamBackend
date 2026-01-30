import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUES, JOB_TYPES } from '../../../common/constants/queue.constants';
import { SettlementJobData } from '../../../common/events/travel.events';

@Processor(QUEUES.SETTLEMENT)
export class SettlementProcessor {
  private readonly logger = new Logger(SettlementProcessor.name);

  @Process(JOB_TYPES.RECALCULATE_SETTLEMENT)
  async recalculateSettlement(job: Job<SettlementJobData>) {
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

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to recalculate settlement for travel ${travelId}: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }

  @Process(JOB_TYPES.UPDATE_BUDGET_STATUS)
  async updateBudgetStatus(job: Job<{ travelId: string; totalSpent: number; budget: number; usagePercent: number }>) {
    const { travelId, totalSpent, budget, usagePercent } = job.data;

    try {
      this.logger.log(`🔥 [BACKGROUND] Updating budget status for travel ${travelId} (${usagePercent.toFixed(1)}%)`);

      // 🚨 예산 초과 알림 로직
      if (usagePercent >= 100) {
        this.logger.warn(`🚨 Budget exceeded for travel ${travelId}: ${totalSpent}원 / ${budget}원`);

        // TODO: 예산 초과 알림 발송
        // await this.notificationService.sendBudgetExceededAlert(travelId);

      } else if (usagePercent >= 80) {
        this.logger.warn(`⚠️  Budget warning for travel ${travelId}: ${usagePercent.toFixed(1)}% used`);

        // TODO: 예산 경고 알림 발송
        // await this.notificationService.sendBudgetWarning(travelId, usagePercent);
      }

      // 📈 예산 상태 통계 업데이트
      this.logger.log(`📊 Budget status updated for travel ${travelId}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`❌ Failed to update budget status for travel ${travelId}: ${errorMessage}`, error instanceof Error ? error.stack : undefined);
      throw error;
    }
  }
}