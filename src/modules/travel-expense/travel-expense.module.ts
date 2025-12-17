import { Module } from '@nestjs/common';
import { TravelExpenseController } from './travel-expense.controller';
import { TravelExpenseService } from './travel-expense.service';
import { MetaModule } from '../meta/meta.module';
import { ProfileModule } from '../profile/profile.module';
import { CacheService } from '../../services/cacheService';

@Module({
  imports: [MetaModule, ProfileModule],
  controllers: [TravelExpenseController],
  providers: [TravelExpenseService, CacheService],
  exports: [TravelExpenseService],
})
export class TravelExpenseModule {}
