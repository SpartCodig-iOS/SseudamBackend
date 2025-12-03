import { Module } from '@nestjs/common';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';
import { MetaModule } from '../meta/meta.module';
import { CacheService } from '../../services/cacheService';

@Module({
  imports: [MetaModule],
  controllers: [TravelController],
  providers: [TravelService, CacheService],
  exports: [TravelService],
})
export class TravelModule {}
