import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelController } from './travel.controller';
import { TravelService, OptimizedTravelService } from './services';
// import { MetaModule } from '../meta/meta.module'; // MetaModule disabled
import { ProfileModule } from '../profile/profile.module';
import { NotificationModule } from '../notification/notification.module';
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
  GetTravelListUseCase,
} from './use-cases';

@Module({
  imports: [
    DatabaseModule,
    // MetaModule, // disabled
    ProfileModule,
    NotificationModule,
    QueueModule,
    TypeOrmModule.forFeature([Travel, TravelMember]),
  ],
  controllers: [TravelController],
  providers: [
    TravelService,
    OptimizedTravelService,
    OptimizedTravelRepository,
    // UseCases
    CreateTravelUseCase,
    InviteMemberUseCase,
    UpdateTravelUseCase,
    DeleteTravelUseCase,
    GetTravelListUseCase,
  ],
  exports: [TravelService, OptimizedTravelService],
})
export class TravelModule {}
