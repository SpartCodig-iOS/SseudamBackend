import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { CacheService } from '../cache-shared/services/cacheService';
import { SmartCacheService } from '../cache-shared/services/smart-cache.service';
import { OAuthModule } from '../oauth/oauth.module';

@Module({
  imports: [OAuthModule],
  controllers: [HealthController],
  providers: [CacheService, SmartCacheService],
})
export class HealthModule {}
