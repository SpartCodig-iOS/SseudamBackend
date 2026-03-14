import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';
import { OptimizedTravelService } from './optimized-travel.service';
import { MetaModule } from '../meta/meta.module';
import { ProfileModule } from '../profile/profile.module';
import { CacheService } from '../cache-shared/services/cacheService';
import { QueueModule } from '../queue/queue.module';
import { DatabaseModule } from '../database/database.module';
import { OptimizedTravelRepository } from './repositories/optimized-travel.repository';
import { Travel } from './entities/travel.entity';
import { TravelMember } from './entities/travel-member.entity';

@Module({
  imports: [
    DatabaseModule,
    MetaModule,
    ProfileModule,
    QueueModule,
    TypeOrmModule.forFeature([Travel, TravelMember]),
  ],
  controllers: [TravelController],
  providers: [
    TravelService,
    OptimizedTravelService,
    OptimizedTravelRepository,
    CacheService,
  ],
  exports: [TravelService, OptimizedTravelService],
})
export class TravelModule {}
