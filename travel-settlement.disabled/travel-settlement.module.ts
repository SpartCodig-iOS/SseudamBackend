import { Module } from '@nestjs/common';
import { TravelSettlementController } from './travel-settlement.controller';
import { TravelSettlementService } from './services';
import { CacheService } from '../cache-shared/services/cacheService';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TravelSettlementController],
  providers: [TravelSettlementService, CacheService],
  exports: [TravelSettlementService],
})
export class TravelSettlementModule {}
