import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { CacheService } from '../cache-shared/services/cacheService';
import { SupabaseService } from '../core/services/supabaseService';
import { DatabaseModule } from '../database/database.module';
import { Profile } from '../../entities/profile.entity';

@Module({
  imports: [
    DatabaseModule,
    TypeOrmModule.forFeature([Profile])
  ],
  controllers: [ProfileController],
  providers: [ProfileService, CacheService, SupabaseService],
  exports: [ProfileService],
})
export class ProfileModule {}
