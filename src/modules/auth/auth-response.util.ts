import type { AuthService } from './auth.service';
import { toUserResponse } from '../../utils/mappers';

export type AuthSessionResult = Awaited<ReturnType<AuthService['signup']>>;

// 균형잡힌 경량화 로그인 응답 (OAuth 전용) - 핵심 필드 유지하며 크기 최적화
export const buildLightweightAuthResponse = (result: AuthSessionResult) => ({
  user: {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name ?? null,
    avatarURL: result.user.avatar_url ?? null,
    role: result.user.role,
    userId: result.user.username,
  },
  accessToken: result.tokenPair.accessToken,
  refreshToken: result.tokenPair.refreshToken,
  accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
  refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
  sessionId: result.session.sessionId,
  loginType: result.loginType,
  // 제거된 필드들 (덜 중요): sessionExpiresAt, lastLoginAt, createdAt
});

export const buildAuthSessionResponse = (result: AuthSessionResult) => ({
  user: toUserResponse(result.user),
  accessToken: result.tokenPair.accessToken,
  refreshToken: result.tokenPair.refreshToken,
  accessTokenExpiresAt: result.tokenPair.accessTokenExpiresAt.toISOString(),
  refreshTokenExpiresAt: result.tokenPair.refreshTokenExpiresAt.toISOString(),
  sessionId: result.session.sessionId,
  sessionExpiresAt: result.session.expiresAt,
  lastLoginAt: result.session.lastSeenAt,
  loginType: result.loginType,
  registered: (result as any).registered ?? undefined,
});
