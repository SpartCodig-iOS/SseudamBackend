import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OAuthController } from './oauth.controller';
import { AuthModule } from '../auth/auth.module';
import { SocialAuthService } from './social-auth.service';
import { DatabaseModule } from '../database/database.module';
import { OAuthTokenService } from './services/oauth-token.service';
import { OAuthTokenRepository } from './repositories/oauth-token.repository';
import { OAuthToken } from './entities/oauth-token.entity';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => AuthModule),
    TypeOrmModule.forFeature([OAuthToken]),
  ],
  controllers: [OAuthController],
  providers: [
    SocialAuthService,
    OAuthTokenService,
    OAuthTokenRepository,
  ],
  exports: [
    SocialAuthService,
    OAuthTokenService,
  ],
})
export class OAuthModule {}
