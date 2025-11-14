import { Global, Module } from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard';
import { JwtTokenService } from '../../services/jwtService';
import { SupabaseService } from '../../services/supabaseService';
import { SessionService } from '../../services/sessionService';

@Global()
@Module({
  providers: [SupabaseService, JwtTokenService, SessionService, AuthGuard],
  exports: [SupabaseService, JwtTokenService, SessionService, AuthGuard],
})
export class SharedModule {}
