import { Module } from '@nestjs/common';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';
import { OptimizedTravelService } from './optimized-travel.service';
import { MetaModule } from '../meta/meta.module';
import { ProfileModule } from '../profile/profile.module';
import { CacheService } from '../../services/cacheService';

@Module({
  imports: [MetaModule, ProfileModule],
  controllers: [TravelController],
  providers: [TravelService, OptimizedTravelService, CacheService],
  exports: [TravelService, OptimizedTravelService],
})
export class TravelModule {}
