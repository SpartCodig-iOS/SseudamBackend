import { Module, forwardRef } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { AuthModule } from '../auth/auth.module';
import { SocialAuthService } from './social-auth.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => AuthModule)],
  controllers: [OAuthController],
  providers: [SocialAuthService],
  exports: [SocialAuthService],
})
export class OAuthModule {}
