import { Module } from '@nestjs/common';
import { TravelExpenseController } from './travel-expense.controller';
import { TravelExpenseService } from './travel-expense.service';
import { MetaModule } from '../meta/meta.module';
import { ProfileModule } from '../profile/profile.module';
import { CacheService } from '../../services/cacheService';
import { QueueModule } from '../queue/queue.module';

@Module({
  imports: [MetaModule, ProfileModule, QueueModule],
  controllers: [TravelExpenseController],
  providers: [TravelExpenseService, CacheService],
  exports: [TravelExpenseService],
})
export class TravelExpenseModule {}
