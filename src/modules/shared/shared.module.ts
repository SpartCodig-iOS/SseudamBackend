import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { JwtTokenService } from '../../services/jwtService';
import { SupabaseService } from '../../services/supabaseService';
import { SessionService } from '../../services/sessionService';
import { RateLimitService } from '../../services/rateLimitService';

@Global()
@Module({
  providers: [
    SupabaseService,
    JwtTokenService,
    SessionService,
    RateLimitService,
    AuthGuard,
    RateLimitGuard,
  ],
  exports: [
    SupabaseService,
    JwtTokenService,
    SessionService,
    RateLimitService,
    AuthGuard,
    RateLimitGuard,
  ],
})
export class SharedModule {}
