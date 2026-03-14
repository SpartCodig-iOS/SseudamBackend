import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthModule } from '../oauth/oauth.module';
import { DatabaseModule } from '../database/database.module';
import { CacheService } from '../cache-shared/services/cacheService';
import { EnhancedJwtService } from '../jwt-shared/services/enhanced-jwt.service';
import { OptimizedDeleteService } from './optimized-delete.service';
import { SessionService } from './services/sessionService';

// TypeORM 기반 새로운 서비스들
import { JwtBlacklist } from './entities/jwt-blacklist.entity';
import { JwtBlacklistRepository } from './repositories/jwt-blacklist.repository';
import { TypeOrmJwtBlacklistService } from './services/typeorm-jwt-blacklist.service';

// 새로운 Entities
import { User as Profile } from '../user/entities/user.entity';
// UserSession은 JWT로 대체됨

import { env } from '../../config/env';

@Module({
  imports: [
    // DatabaseModule이 TypeORM forRoot + forFeature(User) + UserRepository를 모두 제공합니다.
    DatabaseModule,

    // JWT 블랙리스트 엔티티 등록
    TypeOrmModule.forFeature([JwtBlacklist, Profile, UserSession]),

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
    OptimizedDeleteService,
    SessionService,

    // 기존 JWT Blacklist System (캐시 기반)
    EnhancedJwtService,

    // 새로운 TypeORM 기반 JWT Blacklist System
    JwtBlacklistRepository,
    TypeOrmJwtBlacklistService,
  ],
  exports: [
    AuthService,
    CacheService,
    OptimizedDeleteService,
    SessionService,

    // Enhanced JWT 서비스들도 export하여 다른 모듈에서 사용 가능
    EnhancedJwtService,

    // TypeORM 기반 새로운 서비스들 export
    TypeOrmJwtBlacklistService,
    JwtBlacklistRepository,
  ],
})
export class AuthModule {}
