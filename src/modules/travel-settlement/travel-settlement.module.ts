/**
 * TravelSettlementModule
 *
 * 여행 정산 계산 및 조회를 담당한다.
 * TransactionService로 SERIALIZABLE 트랜잭션을 보장한다.
 *
 * 이전 문제: CacheService를 직접 provide해 중복 인스턴스 생성.
 * 개선:
 *   - CacheSharedModule(@Global)  -> CacheService 자동 주입
 *   - AuthSharedModule            -> TransactionService 제공
 */
import { Module } from '@nestjs/common';
import { TravelSettlementController } from './travel-settlement.controller';
import { TravelSettlementService } from './travel-settlement.service';
import { DatabaseModule } from '../database/database.module';
import { AuthSharedModule } from '../shared/auth-shared.module';

@Module({
  imports: [
    DatabaseModule,
    AuthSharedModule,
    // CacheSharedModule(@Global) -> CacheService 자동 주입
  ],
  controllers: [TravelSettlementController],
  providers: [TravelSettlementService],
  exports: [TravelSettlementService],
})
export class TravelSettlementModule {}
