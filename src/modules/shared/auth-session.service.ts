/**
 * AuthSessionService
 *
 * 세션 생성 + JWT 토큰 쌍 발급을 담당하는 순수 인프라 서비스.
 *
 * 목적:
 *   AuthService와 SocialAuthService 모두 "세션 생성 + 토큰 발급"이 필요하다.
 *   이 공통 로직을 AuthSessionService로 추출함으로써
 *   SocialAuthService -> AuthService 의존성(순환 참조의 원인)을 제거한다.
 *
 * 사용처:
 *   - AuthService.createAuthSession() -> 내부에서 AuthSessionService 호출
 *   - SocialAuthService.loginWithOAuthToken() -> AuthSessionService 직접 호출
 *
 * 의존 관계:
 *   AuthSessionService -> SupabaseService (프로필 upsert)
 *   AuthSessionService -> SessionService  (세션 생성)
 *   AuthSessionService -> JwtTokenService (토큰 발급, @Global JwtSharedModule)
 */
import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../../common/services/supabase.service';
import { SessionService, SessionRecord } from '../auth/services/session.service';
import { JwtTokenService, TokenPair } from '../auth/services/jwt.service';
import { UserRecord } from '../user/types/user.types';
import { LoginType } from '../auth/types/auth.types';

export interface AuthSessionPayload {
  user: UserRecord;
  tokenPair: TokenPair;
  loginType: LoginType;
  session: SessionRecord;
}

@Injectable()
export class AuthSessionService {
  private readonly logger = new Logger(AuthSessionService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly sessionService: SessionService,
    private readonly jwtTokenService: JwtTokenService,
  ) {}

  /**
   * 세션 생성 + JWT 토큰 쌍 발급
   *
   * 1. 프로필 레코드가 존재하도록 upsert (FK 오류 방지)
   * 2. 세션 레코드 생성
   * 3. Access/Refresh 토큰 쌍 발급
   */
  async createAuthSession(user: UserRecord, loginType: LoginType): Promise<AuthSessionPayload> {
    const startTime = Date.now();

    // 1. 세션 FK 오류 방지용 프로필 upsert
    await this.supabaseService.upsertProfile({
      id: user.id,
      email: user.email,
      name: user.name,
      username: user.username,
      loginType,
      avatarUrl: user.avatar_url,
    });

    // 2. 세션 생성
    const session = await this.sessionService.createSession(user.id, loginType);

    // 3. JWT 토큰 쌍 발급
    const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType, session.sessionId);

    const duration = Date.now() - startTime;
    this.logger.debug(`Auth session created in ${duration}ms for user ${user.id}`);

    return { user, tokenPair, loginType, session };
  }
}
