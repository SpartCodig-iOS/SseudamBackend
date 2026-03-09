import { Module } from '@nestjs/common';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { CacheService } from '../../services/cacheService';
import { SupabaseService } from '../../services/supabaseService';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ProfileController],
  providers: [ProfileService, CacheService, SupabaseService],
  exports: [ProfileService],
})
export class ProfileModule {}
