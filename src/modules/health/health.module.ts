import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CacheService } from '../cache-shared/services/cacheService';
import { SupabaseService } from '../core/services/supabaseService';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [OAuthModule],
  controllers: [HealthController],
  providers: [CacheService, SupabaseService],
})
export class HealthModule {}
