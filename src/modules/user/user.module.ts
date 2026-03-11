import { Module } from '@nestjs/common';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { DatabaseModule } from '../database/database.module';
import { AuthSharedModule } from '../shared/auth-shared.module';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [DatabaseModule, AuthSharedModule],  // AuthGuard 의존성 (SupabaseService 등)
  controllers: [UserController],
  providers: [UserService, AuthGuard, RolesGuard],
  exports: [UserService],
})
export class UserModule {}