import { Module } from '@nestjs/common';
import { TravelSettlementController } from './travel-settlement.controller';
import { TravelSettlementService } from './travel-settlement.service';

@Module({
  controllers: [TravelSettlementController],
  providers: [TravelSettlementService],
  exports: [TravelSettlementService],
})
export class TravelSettlementModule {}
