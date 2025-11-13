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
    message: 'Either identifier or email is required',
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
    authorizationCode: z.string().min(10).optional(),
  })
  .transform((data) => ({
    accessToken: data.accessToken.trim(),
    loginType: (data.loginType ?? 'email') as LoginType,
    appleRefreshToken: data.appleRefreshToken?.trim(),
    authorizationCode: data.authorizationCode?.trim(),
  }));

export const refreshSchema = z.object({
  refreshToken: z.string().min(10),
});

export const appleRevokeSchema = z.object({
  refreshToken: z.string().min(10).optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type OAuthTokenInput = z.infer<typeof oauthTokenSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type AppleRevokeInput = z.infer<typeof appleRevokeSchema>;
