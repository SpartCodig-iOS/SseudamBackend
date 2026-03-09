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
} from '../../entities';

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