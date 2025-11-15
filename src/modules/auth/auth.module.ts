import { Module, forwardRef } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthModule } from '../oauth/oauth.module';
import { CacheService } from '../../services/cacheService';

@Module({
  imports: [forwardRef(() => OAuthModule)],
  controllers: [AuthController],
  providers: [AuthService, CacheService],
  exports: [AuthService, CacheService],
})
export class AuthModule {}
