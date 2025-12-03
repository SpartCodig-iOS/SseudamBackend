import { Module } from '@nestjs/common';
import { TravelSettlementController } from './travel-settlement.controller';
import { TravelSettlementService } from './travel-settlement.service';
import { CacheService } from '../../services/cacheService';

@Module({
  controllers: [TravelSettlementController],
  providers: [TravelSettlementService, CacheService],
  exports: [TravelSettlementService],
})
export class TravelSettlementModule {}
