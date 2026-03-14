import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserController } from './user.controller';
import { UserService } from './services/user.service';
import { UserRepository } from './repositories/user.repository';
import { DatabaseModule } from '../database/database.module';
import { User } from './entities/user.entity';

// UseCases
import { GetUserProfileUseCase, UpdateUserProfileUseCase } from './use-cases';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([User]),
  ],
  controllers: [UserController],
  providers: [
    UserService,
    UserRepository,
    // UseCases
    GetUserProfileUseCase,
    UpdateUserProfileUseCase,
  ],
  exports: [
    UserService,
    UserRepository,
  ],
})
export class UserModule {}