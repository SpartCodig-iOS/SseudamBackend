import type { AuthService } from './auth.service';
import { toUserResponse } from '../../utils/mappers';

export type AuthSessionResult = Awaited<ReturnType<AuthService['signup']>>;

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
});
