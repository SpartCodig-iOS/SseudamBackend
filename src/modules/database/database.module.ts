import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseConfig } from '../../config/database.config';

// Entities
import {
  User,
  Travel,
  TravelMember,
  TravelExpense,
  TravelExpenseParticipant,
  TravelSettlement,
  AppVersion,
  JwtBlacklist,
} from '../../entities';

// Additional entities
import { Profile } from '../../entities/profile.entity';
import { UserSession } from '../../entities/user-session.entity';
import { DeviceToken } from '../../entities/device-token.entity';

// Notification entities removed for now

// Repositories
import {
  UserRepository,
  TravelRepository,
  TravelMemberRepository,
  TravelExpenseRepository,
  TravelExpenseParticipantRepository,
  TravelSettlementRepository,
  AppVersionRepository,
} from '../../repositories';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createDatabaseConfig,
    }),
    TypeOrmModule.forFeature([
      User,
      Travel,
      TravelMember,
      TravelExpense,
      TravelExpenseParticipant,
      TravelSettlement,
      AppVersion,
      JwtBlacklist,
      Profile,
      UserSession,
      DeviceToken,
    ]),
  ],
  providers: [
    UserRepository,
    TravelRepository,
    TravelMemberRepository,
    TravelExpenseRepository,
    TravelExpenseParticipantRepository,
    TravelSettlementRepository,
    AppVersionRepository,
  ],
  exports: [
    TypeOrmModule,
    UserRepository,
    TravelRepository,
    TravelMemberRepository,
    TravelExpenseRepository,
    TravelExpenseParticipantRepository,
    TravelSettlementRepository,
    AppVersionRepository,
  ],
})
export class DatabaseModule {}