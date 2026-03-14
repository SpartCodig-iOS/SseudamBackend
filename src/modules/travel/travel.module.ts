import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelController } from './travel.controller';
import { TravelService, OptimizedTravelService } from './services';
import { MetaModule } from '../meta/meta.module';
import { ProfileModule } from '../profile/profile.module';
import { CacheService } from '../cache-shared/services/cacheService';
import { QueueModule } from '../queue/queue.module';
import { DatabaseModule } from '../database/database.module';
import { OptimizedTravelRepository } from './repositories/optimized-travel.repository';
import { Travel } from './entities/travel.entity';
import { TravelMember } from './entities/travel-member.entity';

// UseCases
import {
  CreateTravelUseCase,
  InviteMemberUseCase,
  UpdateTravelUseCase,
  DeleteTravelUseCase,
} from './use-cases';

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
    // UseCases
    CreateTravelUseCase,
    InviteMemberUseCase,
    UpdateTravelUseCase,
    DeleteTravelUseCase,
  ],
  exports: [TravelService, OptimizedTravelService],
})
export class TravelModule {}
