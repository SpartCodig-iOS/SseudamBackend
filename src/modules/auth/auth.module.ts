import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { OAuthModule } from '../oauth/oauth.module';
import { DatabaseModule } from '../database/database.module';
import { CoreModule } from '../core/core.module';
import { CacheService } from '../cache-shared/services/cacheService';
import { EnhancedJwtService } from '../jwt-shared/services/enhanced-jwt.service';
import { AuthService } from './services';
// import { OptimizedDeleteService } from './services'; // 임시 비활성화

// 단순한 구조의 Services
import { SessionService, JwtService } from './services';

// UseCases
import { LoginUseCase, RegisterUseCase, LogoutUseCase, RefreshTokenUseCase } from './useCases';

// Repositories
import { JwtBlacklistRepository, UserRepository } from './repositories';

// TypeORM 기반 새로운 서비스들
import { JwtBlacklist } from './entities/jwt-blacklist.entity';
import { TypeOrmJwtBlacklistService } from './services/typeorm-jwt-blacklist.service';

// 새로운 Entities
import { User as Profile } from '../user/entities/user.entity';
import { SupabaseService } from '../core/services/supabaseService';
import { AppMetricsService } from '../../common/metrics/app-metrics.service';
import { AuthSessionService } from '../shared/services/auth-session.service';

import { env } from '../../config/env';

@Module({
  imports: [
    // DatabaseModule이 TypeORM forRoot + forFeature(User) + UserRepository를 모두 제공합니다.
    DatabaseModule,
    CoreModule,

    // JWT 블랙리스트 엔티티 등록
    TypeOrmModule.forFeature([JwtBlacklist, Profile]),

    forwardRef(() => OAuthModule),

    // JWT 모듈 등록 (Enhanced JWT 서비스용)
    JwtModule.register({
      secret: env.jwtSecret,
      signOptions: {
        expiresIn: `${env.accessTokenTTL}s`,
        issuer: 'sseudam-backend',
        audience: 'sseudam-app',
      },
    }),
  ],
  controllers: [
    AuthController,
  ],
  providers: [
    AuthService,
    CacheService,
    SupabaseService,
    AuthSessionService,
    AppMetricsService,
    // OptimizedDeleteService, // 임시 비활성화

    // 단순한 구조의 Services
    SessionService,
    JwtService,

    // UseCases
    LoginUseCase,
    RegisterUseCase,
    LogoutUseCase,
    RefreshTokenUseCase,

    // Repositories
    JwtBlacklistRepository,
    UserRepository,

    // 기존 JWT Blacklist System (캐시 기반)
    EnhancedJwtService,

    // 새로운 TypeORM 기반 JWT Blacklist System
    TypeOrmJwtBlacklistService,
  ],
  exports: [
    AuthService,
    CacheService,
    // OptimizedDeleteService, // 임시 비활성화

    // 단순한 구조의 Services
    SessionService,
    JwtService,

    // UseCases
    LoginUseCase,
    RegisterUseCase,
    LogoutUseCase,
    RefreshTokenUseCase,

    // Repositories
    JwtBlacklistRepository,
    UserRepository,

    // Enhanced JWT 서비스들도 export하여 다른 모듈에서 사용 가능
    EnhancedJwtService,

    // TypeORM 기반 새로운 서비스들 export
    TypeOrmJwtBlacklistService,
  ],
})
export class AuthModule {}
