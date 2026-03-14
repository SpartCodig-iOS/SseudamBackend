import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSessionService } from './services';
import { TypeOrmJwtBlacklistService } from '../auth/services/typeorm-jwt-blacklist.service';
import { SupabaseService } from '../core/services/supabaseService';
import { OAuthTokenService } from '../oauth/services/oauth-token.service';
import { JwtBlacklist } from '../auth/entities/jwt-blacklist.entity';
import { OAuthToken } from '../oauth/entities/oauth-token.entity';
import { JwtBlacklistRepository } from '../auth/repositories/jwt-blacklist.repository';
import { OAuthTokenRepository } from '../oauth/repositories/oauth-token.repository';

/**
 * AuthSharedModule
 *
 * 공유 인증 서비스들을 전역적으로 제공하는 모듈
 * - AuthSessionService: 세션 기반 인증 서비스
 * - TypeOrmJwtBlacklistService: JWT 블랙리스트 서비스
 * - SupabaseService: Supabase 인증 서비스
 * - OAuthTokenService: OAuth 토큰 서비스
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([JwtBlacklist, OAuthToken]),
  ],
  providers: [
    AuthSessionService,
    JwtBlacklistRepository,
    OAuthTokenRepository,
    TypeOrmJwtBlacklistService,
    SupabaseService,
    OAuthTokenService,
  ],
  exports: [
    AuthSessionService,
    JwtBlacklistRepository,
    OAuthTokenRepository,
    TypeOrmJwtBlacklistService,
    SupabaseService,
    OAuthTokenService,
  ],
})
export class AuthSharedModule {}