import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email().optional(),
  identifier: z.string().min(1).optional(),
  password: z.string().min(6).optional(), // 소셜 로그인 시 선택적
  // 소셜 로그인 필드들
  provider: z.enum(['email', 'google', 'apple', 'kakao']).optional(),
  accessToken: z.string().optional(),
  authorizationCode: z.string().optional(),
  codeVerifier: z.string().optional(),
  redirectUri: z.string().optional(),
  deviceToken: z.string().optional(),
  pendingKey: z.string().optional(),
}).refine(data => {
  // 이메일 로그인: identifier/email + password 필요
  if (!data.provider || data.provider === 'email') {
    return (data.email || data.identifier) && data.password;
  }
  // 소셜 로그인: accessToken 또는 authorizationCode 필요
  return data.accessToken || data.authorizationCode;
}, {
  message: "Invalid login credentials",
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(), // 클라이언트가 보내는 필드
  nickname: z.string().min(1).optional(), // 레거시 지원
  profileImageUrl: z.string().url().optional(),
  deviceToken: z.string().optional(), // APNS 디바이스 토큰
  pendingKey: z.string().optional(), // 익명 토큰 매칭 키
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const refreshSchema = refreshTokenSchema;
export const signupSchema = registerSchema;

export const logoutSchema = z.object({
  sessionId: z.string(), // 필수 필드
  token: z.string().optional(), // 레거시 지원
});

export const appleRevokeSchema = z.object({
  authorizationCode: z.string().optional(),
  refreshToken: z.string().optional(),
}).refine(data => data.authorizationCode || data.refreshToken, {
  message: "Either authorizationCode or refreshToken must be provided",
});

export const oauthTokenSchema = z.object({
  // 클라이언트 요청 형식 지원
  accessToken: z.string(),
  loginType: z.enum(['google', 'apple', 'kakao']).optional(),
  // 레거시 지원
  token: z.string().optional(),
  provider: z.enum(['google', 'apple', 'kakao']).optional(),
  // 추가 필드들
  authorizationCode: z.string().optional(),
  codeVerifier: z.string().optional(),
  redirectUri: z.string().optional(),
  deviceToken: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type SignupInput = RegisterInput;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;