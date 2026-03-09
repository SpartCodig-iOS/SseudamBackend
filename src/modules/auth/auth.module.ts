import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthModule } from '../oauth/oauth.module';
import { DatabaseModule } from '../database/database.module';
import { CacheService } from '../../services/cacheService';
import { EnhancedJwtService } from '../../services/enhanced-jwt.service';
import { JwtBlacklistService } from '../../services/jwt-blacklist.service';
import { env } from '../../config/env';

@Module({
  imports: [
    // DatabaseModule이 TypeORM forRoot + forFeature(User) + UserRepository를 모두 제공합니다.
    // DataSource도 TypeOrmModule을 통해 자동으로 주입 가능합니다.
    DatabaseModule,
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
    // JWT Blacklist System
    EnhancedJwtService,
    JwtBlacklistService,
  ],
  exports: [
    AuthService,
    CacheService,
    // Enhanced JWT 서비스들도 export하여 다른 모듈에서 사용 가능
    EnhancedJwtService,
    JwtBlacklistService,
  ],
})
export class AuthModule {}
