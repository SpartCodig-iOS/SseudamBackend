import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createDatabaseConfig } from '../../config/database.config';
import { User } from '../user/entities/user.entity';
import { JwtBlacklist } from '../auth/entities/jwt-blacklist.entity';
import { AppVersion } from '../meta/entities/app-version.entity';
import { UserSession } from '../auth/entities/user-session.entity';
import { DeviceTokenEntity } from '../notification/entities/device-token.entity';
import { UserRepository } from '../../repositories/user.repository';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      useFactory: createDatabaseConfig,
    }),
    TypeOrmModule.forFeature([
      User,
      AppVersion,
      JwtBlacklist,
      UserSession,
      DeviceTokenEntity,
    ]),
  ],
  providers: [
    UserRepository,
  ],
  exports: [
    TypeOrmModule,
    UserRepository,
  ],
})
export class DatabaseModule {}
