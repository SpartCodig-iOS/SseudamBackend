import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseConfig } from '../../config/database.config';

// Entities
import { User } from '../user/entities/user.entity';
import { Travel } from '../travel/entities/travel.entity';
import { TravelMember } from '../travel/entities/travel-member.entity';
import { TravelInvite } from '../travel/entities/travel-invite.entity';
import { TravelCurrencySnapshot } from '../travel/entities/travel-currency-snapshot.entity';
import { CurrencyRate } from '../travel/entities/currency-rate.entity';
import { TravelExpense } from '../travel-expense/entities/travel-expense.entity';
import { TravelExpenseParticipant } from '../travel-expense/entities/travel-expense-participant.entity';
import { TravelSettlement } from '../travel-settlement/entities/travel-settlement.entity';
import { AppVersion } from '../meta/entities/app-version.entity';
import { AppVersionHistory } from '../meta/entities/app-version-history.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { DeviceToken } from '../oauth/entities/device-token.entity';
import { OAuthToken } from '../oauth/entities/oauth-token.entity';

// Repositories
import { UserRepository } from '../user/repositories/user.repository';
import { TravelRepository } from '../travel/repositories/travel.repository';
import { TravelMemberRepository } from '../travel/repositories/travel-member.repository';
import { TravelExpenseRepository } from '../travel-expense/repositories/travel-expense.repository';
import { TravelExpenseParticipantRepository } from '../travel-expense/repositories/travel-expense-participant.repository';
import { TravelSettlementRepository } from '../travel-settlement/repositories/travel-settlement.repository';
import { AppVersionRepository } from '../meta/repositories/app-version.repository';
import { SessionRepository } from '../auth/repositories/session.repository';
import { DeviceTokenRepository } from '../oauth/repositories/device-token.repository';
import { OAuthTokenRepository } from '../oauth/repositories/oauth-token.repository';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createDatabaseConfig,
    }),
    TypeOrmModule.forFeature([
      User,
      Travel,
      TravelMember,
      TravelInvite,
      TravelCurrencySnapshot,
      CurrencyRate,
      TravelExpense,
      TravelExpenseParticipant,
      TravelSettlement,
      AppVersion,
      AppVersionHistory,
      UserSession,
      DeviceToken,
      OAuthToken,
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
    SessionRepository,
    DeviceTokenRepository,
    OAuthTokenRepository,
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
    SessionRepository,
    DeviceTokenRepository,
    OAuthTokenRepository,
  ],
})
export class DatabaseModule {}