import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CacheService } from '../cache-shared/services/cacheService';
import { SupabaseService } from '../core/services/supabaseService';

@Module({
  controllers: [HealthController],
  providers: [CacheService, SupabaseService],
})
export class HealthModule {}
