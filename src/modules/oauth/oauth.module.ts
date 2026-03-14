import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthController } from './oauth.controller';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { CoreModule } from '../core/core.module';
import { CacheService } from '../cache-shared/services/cacheService';
import { SupabaseService } from '../core/services/supabaseService';
import { SocialAuthService, OAuthTokenService } from './services';
import { OptimizedOAuthService } from './services/optimized-oauth.service';
import { OAuthTokenRepository } from './repositories/oauth-token.repository';
import { OAuthToken } from './entities/oauth-token.entity';

// UseCases - 누락된 파일들
// import { GoogleLoginUseCase, KakaoLoginUseCase, AppleLoginUseCase } from './use-cases';

@Module({
  imports: [
    TypeOrmModule.forFeature([OAuthToken]),
    DatabaseModule,
    CoreModule,
    forwardRef(() => AuthModule),
  ],
  controllers: [OAuthController],
  providers: [
    SocialAuthService,
    OAuthTokenService,
    OptimizedOAuthService,
    OAuthTokenRepository,
    CacheService,
    SupabaseService,
    // UseCases - 누락된 파일들
    // GoogleLoginUseCase,
    // KakaoLoginUseCase,
    // AppleLoginUseCase,
  ],
  exports: [
    SocialAuthService,
    OAuthTokenService,
    SupabaseService,
    CacheService,
    OptimizedOAuthService,
  ],
})
export class OAuthModule {}
