/**
 * AuthSharedModule
 *
 * 인증/인가 관련 공유 서비스를 관리한다.
 * AuthModule과 OAuthModule 양쪽에서 필요한 서비스들을 중립적인 위치에 둠으로써
 * 두 모듈 간 직접 참조를 제거한다.
 *
 * 포함 서비스:
 * - SupabaseService: Supabase Auth 연동 + 프로필 관리
 * - OAuthTokenService: OAuth 리프레시 토큰 저장소
 * - SessionService: 세션 생성/검증
 * - TransactionService: TypeORM 트랜잭션 래퍼
 *
 * 의존 관계:
 *   AuthSharedModule -> DatabaseModule (TypeORM DataSource)
 *   AuthSharedModule -> CacheSharedModule (@Global, 자동 주입)
 *
 * 규칙:
 *  1. AuthModule/OAuthModule을 import하지 않는다.
 *  2. 비즈니스 로직이 없는 인프라/유틸 서비스만 포함한다.
 */
import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SupabaseService } from '../../common/services/supabase.service';
import { OAuthTokenService } from '../oauth/services/oauth-token.service';
import { SessionService } from '../auth/services/session.service';
import { TransactionService } from '../../common/services/transaction.service';
import { AuthSessionService } from './auth-session.service';

/**
 * AuthSharedModule
 *
 * @Global() 선언으로 AppModule에 한 번만 import하면 전체 앱에서 사용 가능.
 * AuthGuard가 SupabaseService를 의존하므로 전역으로 제공해야 함.
 *
 * DatabaseModule을 import하면 SessionRepository, OAuthTokenRepository,
 * DeviceTokenRepository가 exports에 포함되어 자동으로 제공됩니다.
 * 별도 Repository 등록 없이 TypeORM DI로 주입됩니다.
 */
@Global()
@Module({
  imports: [DatabaseModule],
  providers: [
    OAuthTokenService,
    SupabaseService,
    SessionService,
    TransactionService,
    // AuthService/SocialAuthService 양쪽에서 필요한 세션+토큰 발급 로직
    // 순환 참조 없이 단방향으로 제공
    AuthSessionService,
  ],
  exports: [
    OAuthTokenService,
    SupabaseService,
    SessionService,
    TransactionService,
    AuthSessionService,
  ],
})
export class AuthSharedModule {}
