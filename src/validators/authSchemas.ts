import { z } from 'zod';
import { LOGIN_TYPE_VALUES, LoginType } from '../types/auth';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).max(120).optional(),
});

const loginTypeEnum = z.enum(LOGIN_TYPE_VALUES);

export const loginSchema = z
  .object({
    identifier: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((data) => Boolean(data.identifier ?? data.email), {
    message: 'identifier or email is required',
    path: ['identifier'],
  })
  .transform((data) => ({
    identifier: (data.identifier ?? data.email ?? '').trim(),
    password: data.password,
  }));

export const oauthTokenSchema = z
  .object({
    accessToken: z.string().min(10, 'accessToken is required'),
    loginType: loginTypeEnum.optional(),
    appleRefreshToken: z.string().min(10).optional(),
    googleRefreshToken: z.string().min(10).optional(),
    authorizationCode: z.string().min(10).optional(),
    codeVerifier: z.string().min(10).optional(),
    redirectUri: z.string().min(5).optional(),
  })
  .transform((data) => ({
    accessToken: data.accessToken.trim(),
    loginType: (
      data.loginType ??
      (data.authorizationCode
        ? 'apple'
        : data.appleRefreshToken
          ? 'apple'
          : data.googleRefreshToken
            ? 'google'
            : 'email')
    ) as LoginType,
    appleRefreshToken: data.appleRefreshToken?.trim(),
    googleRefreshToken: data.googleRefreshToken?.trim(),
    authorizationCode: data.authorizationCode?.trim(),
    codeVerifier: data.codeVerifier?.trim(),
    redirectUri: data.redirectUri?.trim(),
  }));

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
