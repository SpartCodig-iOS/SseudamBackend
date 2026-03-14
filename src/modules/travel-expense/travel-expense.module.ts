import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TravelExpenseController } from './travel-expense.controller';
import { TravelExpenseService } from './services';
// import { MetaModule } from '../meta/meta.module'; // MetaModule disabled
import { ProfileModule } from '../profile/profile.module';
import { QueueModule } from '../queue/queue.module';
import { NotificationModule } from '../notification/notification.module';
import { DatabaseModule } from '../database/database.module';

// Import entities
import { TravelExpense } from './entities/travel-expense.entity';
import { TravelExpenseParticipant } from './entities/travel-expense-participant.entity';
import { Travel } from '../travel/entities/travel.entity';
import { TravelMember } from '../travel/entities/travel-member.entity';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([
      TravelExpense,
      TravelExpenseParticipant,
      Travel,
      TravelMember,
      User
    ]),
    // MetaModule, // disabled
    ProfileModule,
    NotificationModule,
    QueueModule
  ],
  controllers: [TravelExpenseController],
  providers: [TravelExpenseService],
  exports: [TravelExpenseService],
})
export class TravelExpenseModule {}
