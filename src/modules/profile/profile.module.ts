import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileController } from './profile.controller';
import { ProfileService } from './services';
import { CacheService } from '../cache-shared/services/cacheService';
import { SupabaseService } from '../core/services/supabaseService';
import { DatabaseModule } from '../database/database.module';
import { OAuthModule } from '../oauth/oauth.module';
import { User } from '../user/entities/user.entity';

@Module({
  imports: [
    DatabaseModule,
    OAuthModule,
    TypeOrmModule.forFeature([User])
  ],
  controllers: [ProfileController],
  providers: [ProfileService, CacheService, SupabaseService],
  exports: [ProfileService],
})
export class ProfileModule {}
