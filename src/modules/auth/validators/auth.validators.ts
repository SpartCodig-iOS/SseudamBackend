import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().optional(),
  identifier: z.string().min(1).optional(),
  password: z.string().min(6),
}).refine(data => data.email || data.identifier, {
  message: "Either email or identifier must be provided",
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  nickname: z.string().min(1),
  name: z.string().min(1).optional(),
  profileImageUrl: z.string().url().optional(),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const refreshSchema = refreshTokenSchema;
export const signupSchema = registerSchema;

export const logoutSchema = z.object({
  token: z.string().optional(),
  sessionId: z.string().optional(),
});

export const appleRevokeSchema = z.object({
  authorizationCode: z.string().optional(),
  refreshToken: z.string().optional(),
}).refine(data => data.authorizationCode || data.refreshToken, {
  message: "Either authorizationCode or refreshToken must be provided",
});

export const oauthTokenSchema = z.object({
  token: z.string(),
  provider: z.enum(['google', 'apple', 'kakao']),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SignupInput = RegisterInput;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;