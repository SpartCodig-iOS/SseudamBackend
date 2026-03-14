export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  profileImageUrl?: string;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  nickname: string;
  profileImageUrl?: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  provider: 'google' | 'apple' | 'kakao';
}

export enum LoginType {
  EMAIL = 'email',
  GOOGLE = 'google',
  APPLE = 'apple',
  KAKAO = 'kakao',
  SIGNUP = 'signup',
  USERNAME = 'username',
}

// 문자열 리터럴로도 접근 가능하게 하는 타입
export type LoginTypeString = 'email' | 'google' | 'apple' | 'kakao' | 'signup' | 'username';

export interface TokenPayload {
  sub: number | string;
  email: string;
  name?: string;
  role?: string;
  loginType?: LoginType;
  sessionId?: string;
  iat?: number;
  exp?: number;
  jti?: string;
}

export interface SocialUserInfo {
  providerId: string;
  email: string;
  nickname?: string;
  profileImageUrl?: string;
}

export interface SocialLookupResult {
  exists: boolean;
  registered?: boolean;
  userId?: string;
  user?: AuthUser;
  socialUserInfo?: SocialUserInfo;
}

export interface SessionData {
  userId: string;
  deviceInfo?: {
    userAgent: string;
    ip: string;
    platform?: string;
    browser?: string;
  };
  lastActivity: Date;
  isActive: boolean;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}