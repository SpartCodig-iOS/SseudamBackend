import { z } from 'zod';
import { LOGIN_TYPE_VALUES, LoginType } from '../types/auth';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(120).optional(),
  deviceToken: z.string().min(10).optional(),
});

const loginTypeEnum = z.enum(LOGIN_TYPE_VALUES);

export const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1).optional(),
    provider: loginTypeEnum.optional(),
    accessToken: z.string().min(1).optional(),
    authorizationCode: z.string().min(1).optional(),
    codeVerifier: z.string().min(10).optional(),
    redirectUri: z.string().min(5).optional(),
    deviceToken: z.string().min(10).optional(),
  })
  .refine((data) => {
    const hasProvider = Boolean(data.provider && data.provider !== 'email');
    const isKakao = data.provider === 'kakao';
    const hasSocialToken = Boolean(data.accessToken || data.authorizationCode);
    const hasKakaoPkce = isKakao ? Boolean(data.authorizationCode && data.codeVerifier) : true;
    const hasPasswordLogin = Boolean(data.password && (data.identifier || data.email));
    return ((hasProvider && hasSocialToken && hasKakaoPkce)) || hasPasswordLogin;
  }, {
    message: 'For social login provide provider and accessToken/authorizationCode, or provide email/identifier and password',
    path: ['identifier'],
  })
  .transform((data) => ({
    identifier: (data.identifier ?? data.email ?? '').trim(),
    password: data.password,
    provider: data.provider,
    accessToken: data.accessToken?.trim(),
    authorizationCode: data.authorizationCode?.trim(),
    codeVerifier: data.codeVerifier?.trim(),
    redirectUri: data.redirectUri?.trim(),
    deviceToken: data.deviceToken?.trim(),
  }));

export const oauthTokenSchema = z
  .object({
    accessToken: z.string().min(10, 'accessToken is required').optional(),
    loginType: loginTypeEnum.optional(),
    appleRefreshToken: z.string().min(10).optional(),
    googleRefreshToken: z.string().min(10).optional(),
    authorizationCode: z.string().min(10).optional(),
    codeVerifier: z.string().min(10).optional(),
    redirectUri: z.string().min(5).optional(),
    deviceToken: z.string().min(10).optional(),
  })
  .refine((data) => {
    const loginType = data.loginType ?? 'email';
    const hasAccessToken = Boolean(data.accessToken);
    const isKakaoWithPkce = loginType === 'kakao' && Boolean(data.authorizationCode && data.codeVerifier);
    if (loginType === 'kakao') {
      return isKakaoWithPkce;
    }
    return hasAccessToken;
  }, {
    message: 'Kakao는 authorizationCode+codeVerifier가 필요하고, 기타 프로바이더는 accessToken이 필요합니다.',
    path: ['authorizationCode'],
  })
  .transform((data) => {
    const loginType = (
      data.loginType ??
      (data.appleRefreshToken
        ? 'apple'
        : data.googleRefreshToken
          ? 'google'
          : 'email')
    ) as LoginType;

    return {
      accessToken: data.accessToken?.trim() ?? '',
      loginType,
      appleRefreshToken: data.appleRefreshToken?.trim(),
      googleRefreshToken: data.googleRefreshToken?.trim(),
      authorizationCode: data.authorizationCode?.trim(),
      codeVerifier: data.codeVerifier?.trim(),
      redirectUri: data.redirectUri?.trim(),
      deviceToken: data.deviceToken?.trim(),
    };
  });

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const appleRevokeSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export const logoutSchema = z.object({
  sessionId: z.string().min(10, 'sessionId is required'),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type AppleRevokeInput = z.infer<typeof appleRevokeSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
