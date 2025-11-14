import { Injectable, ServiceUnavailableException, UnauthorizedException, BadRequestException, Inject, forwardRef, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { LoginType } from '../../types/auth';
import { SupabaseService } from '../../services/supabaseService';
import { AuthService, AuthSessionPayload } from '../auth/auth.service';
import { fromSupabaseUser } from '../../utils/mappers';
import { env } from '../../config/env';

export interface SocialLookupResult {
  registered: boolean;
}

export interface OAuthTokenOptions {
  appleRefreshToken?: string | null;
  googleRefreshToken?: string | null;
  authorizationCode?: string | null;
  codeVerifier?: string | null;
  redirectUri?: string | null;
}

@Injectable()
export class SocialAuthService {
  private readonly logger = new Logger(SocialAuthService.name);

  // Apple JWT 토큰 캐싱 (10분 TTL)
  private appleClientSecretCache: { token: string; expiresAt: number } | null = null;

  // OAuth 토큰 교환 요청 캐싱 (중복 요청 방지)
  private readonly tokenExchangePromises = new Map<string, Promise<string>>();

  // 네트워크 타임아웃 설정 (빠른 실패)
  private readonly NETWORK_TIMEOUT = 8000; // 8초

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {}

  private ensureAppleEnv() {
    if (!env.appleClientId || !env.appleTeamId || !env.appleKeyId || !env.applePrivateKey) {
      throw new ServiceUnavailableException('Apple credentials are not configured');
    }
  }

  private ensureGoogleEnv() {
    if (!env.googleClientId || !env.googleClientSecret) {
      throw new ServiceUnavailableException('Google credentials are not configured');
    }
  }

  private buildAppleClientSecret() {
    // 캐시된 토큰이 있고 아직 유효하면 재사용
    if (this.appleClientSecretCache && this.appleClientSecretCache.expiresAt > Date.now()) {
      return this.appleClientSecretCache.token;
    }

    this.ensureAppleEnv();
    const privateKey = env.applePrivateKey!.replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);

    const token = jwt.sign(
      {
        iss: env.appleTeamId,
        iat: now,
        exp: now + 60 * 10, // 10분 만료
        aud: 'https://appleid.apple.com',
        sub: env.appleClientId,
      },
      privateKey,
      {
        algorithm: 'ES256',
        keyid: env.appleKeyId!,
      },
    );

    // 캐시에 저장 (9분 후 만료로 설정하여 여유 시간 확보)
    this.appleClientSecretCache = {
      token,
      expiresAt: Date.now() + (9 * 60 * 1000)
    };

    return token;
  }

  // 네트워크 요청 헬퍼 (타임아웃 포함)
  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.NETWORK_TIMEOUT);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'SseudamBackend/1.0.0',
          ...options.headers,
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException('OAuth request timeout');
      }
      throw error;
    }
  }

  async loginWithOAuthToken(
    accessToken: string,
    loginType: LoginType = 'email',
    options: OAuthTokenOptions = {},
  ): Promise<AuthSessionPayload> {
    const startTime = Date.now();

    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }

    // 사용자 정보 조회 및 프로필 생성을 병렬 처리
    const [supabaseUser] = await Promise.all([
      this.supabaseService.getUserFromToken(accessToken)
    ]);

    if (!supabaseUser) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    // 프로필 생성과 토큰 교환을 병렬로 처리
    const { appleRefreshToken, googleRefreshToken, authorizationCode, codeVerifier, redirectUri } = options;

    const tasks: Promise<any>[] = [
      this.supabaseService.ensureProfileFromSupabaseUser(supabaseUser, loginType)
    ];

    // 토큰 교환 작업들을 병렬로 추가
    let appleTokenPromise: Promise<string | null> = Promise.resolve(appleRefreshToken || null);
    let googleTokenPromise: Promise<string | null> = Promise.resolve(googleRefreshToken || null);

    if (loginType === 'apple' && !appleRefreshToken && authorizationCode) {
      appleTokenPromise = this.exchangeAppleAuthorizationCode(authorizationCode);
    }

    if (loginType === 'google' && !googleRefreshToken && authorizationCode) {
      googleTokenPromise = this.exchangeGoogleAuthorizationCode(authorizationCode, {
        codeVerifier,
        redirectUri,
      });
    }

    // 모든 비동기 작업을 병렬로 실행
    const [, finalAppleRefreshToken, finalGoogleRefreshToken] = await Promise.all([
      ...tasks,
      appleTokenPromise,
      googleTokenPromise
    ]);

    const preferDisplayName = loginType !== 'email' && loginType !== 'username';
    const user = fromSupabaseUser(supabaseUser, { preferDisplayName });

    // 토큰 저장 작업도 병렬로 처리
    const saveTokenTasks: Promise<void>[] = [];

    if (loginType === 'apple' && finalAppleRefreshToken) {
      saveTokenTasks.push(
        this.supabaseService.saveAppleRefreshToken(user.id, finalAppleRefreshToken)
      );
    }

    if (loginType === 'google' && finalGoogleRefreshToken) {
      saveTokenTasks.push(
        this.supabaseService.saveGoogleRefreshToken(user.id, finalGoogleRefreshToken)
      );
    }

    // 토큰 저장과 세션 생성을 병렬로 처리
    const [authSession] = await Promise.all([
      this.authService.createAuthSession(user, loginType),
      ...saveTokenTasks
    ]);

    const duration = Date.now() - startTime;
    this.logger.debug(`OAuth login completed in ${duration}ms for ${user.email}`);

    return authSession;
  }

  async checkOAuthAccount(
    accessToken: string,
    loginType: LoginType = 'email',
  ): Promise<SocialLookupResult> {
    if (!accessToken) {
      throw new UnauthorizedException('Missing Supabase access token');
    }
    const supabaseUser = await this.supabaseService.getUserFromToken(accessToken);
    if (!supabaseUser || !supabaseUser.id || !supabaseUser.email) {
      throw new UnauthorizedException('Invalid Supabase access token');
    }

    const profile = await this.supabaseService.findProfileById(supabaseUser.id);
    return { registered: Boolean(profile) };
  }

  async revokeAppleConnection(userId: string, refreshToken?: string): Promise<void> {
    const tokenToUse =
      refreshToken ??
      (await this.supabaseService.getAppleRefreshToken(userId)) ??
      null;
    if (!tokenToUse) {
      throw new BadRequestException('Apple refresh token is required');
    }
    this.ensureAppleEnv();
    const clientSecret = this.buildAppleClientSecret();

    const body = new URLSearchParams({
      token: tokenToUse,
      token_type_hint: 'refresh_token',
      client_id: env.appleClientId!,
      client_secret: clientSecret,
    });

    const response = await fetch('https://appleid.apple.com/auth/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Apple revoke failed: ${response.status} ${text}`);
    }
    await this.supabaseService.saveAppleRefreshToken(userId, null);
  }

  async revokeGoogleConnection(userId: string, refreshToken?: string): Promise<void> {
    const tokenToUse =
      refreshToken ??
      (await this.supabaseService.getGoogleRefreshToken(userId)) ??
      null;
    if (!tokenToUse) {
      throw new BadRequestException('Google refresh token is required');
    }
    this.ensureGoogleEnv();

    const body = new URLSearchParams({
      token: tokenToUse,
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
    });

    const response = await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Google revoke failed: ${response.status} ${text}`);
    }
    await this.supabaseService.saveGoogleRefreshToken(userId, null);
  }

  private resolveGoogleRedirectUri(override?: string | null): string {
    const resolved = override ?? env.googleRedirectUri;
    if (!resolved) {
      throw new ServiceUnavailableException('Google redirect URI is not configured');
    }
    return resolved;
  }

  private async exchangeAppleAuthorizationCode(code: string): Promise<string> {
    const cacheKey = `apple-${code}`;

    // 중복 요청 방지: 동일한 코드로 진행 중인 요청이 있으면 재사용
    const existingPromise = this.tokenExchangePromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const exchangePromise = this._exchangeAppleAuthorizationCode(code);
    this.tokenExchangePromises.set(cacheKey, exchangePromise);

    try {
      const result = await exchangePromise;
      return result;
    } finally {
      // 요청 완료 후 캐시에서 제거
      this.tokenExchangePromises.delete(cacheKey);
    }
  }

  private async _exchangeAppleAuthorizationCode(code: string): Promise<string> {
    this.ensureAppleEnv();
    const clientSecret = this.buildAppleClientSecret();
    const body = new URLSearchParams({
      client_id: env.appleClientId!,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });

    const response = await this.fetchWithTimeout('https://appleid.apple.com/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Apple token exchange failed: ${response.status} ${text}`);
    }
    const result = (await response.json()) as { refresh_token?: string };
    if (!result.refresh_token) {
      throw new ServiceUnavailableException('Apple did not return a refresh_token');
    }
    return result.refresh_token;
  }

  private async exchangeGoogleAuthorizationCode(
    code: string,
    options: { codeVerifier?: string | null; redirectUri?: string | null } = {},
  ): Promise<string> {
    const cacheKey = `google-${code}-${options.codeVerifier || 'default'}`;

    // 중복 요청 방지
    const existingPromise = this.tokenExchangePromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const exchangePromise = this._exchangeGoogleAuthorizationCode(code, options);
    this.tokenExchangePromises.set(cacheKey, exchangePromise);

    try {
      const result = await exchangePromise;
      return result;
    } finally {
      this.tokenExchangePromises.delete(cacheKey);
    }
  }

  private async _exchangeGoogleAuthorizationCode(
    code: string,
    options: { codeVerifier?: string | null; redirectUri?: string | null } = {},
  ): Promise<string> {
    this.ensureGoogleEnv();
    const body = new URLSearchParams({
      client_id: env.googleClientId!,
      client_secret: env.googleClientSecret!,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.resolveGoogleRedirectUri(options.redirectUri),
    });

    if (options.codeVerifier) {
      body.set('code_verifier', options.codeVerifier);
    }

    const response = await this.fetchWithTimeout('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new ServiceUnavailableException(`Google token exchange failed: ${response.status} ${text}`);
    }

    const result = (await response.json()) as { refresh_token?: string };
    if (!result.refresh_token) {
      throw new ServiceUnavailableException('Google did not return a refresh_token');
    }
    return result.refresh_token;
  }
}
