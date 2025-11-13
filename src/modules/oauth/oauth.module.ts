import { Module, forwardRef } from '@nestjs/common';
import { OAuthController } from './oauth.controller';
import { AuthModule } from '../auth/auth.module';
import { SocialAuthService } from './social-auth.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  controllers: [OAuthController],
  providers: [SocialAuthService],
  exports: [SocialAuthService],
})
export class OAuthModule {}
