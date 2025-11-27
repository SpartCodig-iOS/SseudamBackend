import { Injectable, InternalServerErrorException, UnauthorizedException, Inject, forwardRef, Logger } from '@nestjs/common';
import bcrypt from 'bcryptjs';
import { LoginType } from '../../types/auth';
import { UserRecord } from '../../types/user';
import { LoginInput, SignupInput } from '../../validators/authSchemas';
import { JwtTokenService, TokenPair } from '../../services/jwtService';
import { SessionRecord, SessionService } from '../../services/sessionService';
import { SupabaseService } from '../../services/supabaseService';
import { CacheService } from '../../services/cacheService';
import { fromSupabaseUser } from '../../utils/mappers';
import { SocialAuthService } from '../oauth/social-auth.service';
import { getPool } from '../../db/pool';

export interface AuthSessionPayload {
  user: UserRecord;
  tokenPair: TokenPair;
  loginType: LoginType;
  session: SessionRecord;
}

interface RefreshPayload {
  tokenPair: TokenPair;
  loginType: LoginType;
  session: SessionRecord;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly identifierCache = new Map<string, { email: string; expiresAt: number }>();
  private readonly IDENTIFIER_CACHE_TTL = 5 * 60 * 1000;
  private readonly IDENTIFIER_CACHE_REDIS_PREFIX = 'identifier';

  // 성공한 로그인에 대한 bcrypt 캐시 (5분 TTL)
  private readonly bcryptCache = new Map<string, { hash: string; expiresAt: number }>();
  private readonly BCRYPT_CACHE_TTL = 5 * 60 * 1000; // 5분

  // 사용자 정보 캐시 (2분 TTL, 빠른 재로그인)
  private readonly userCache = new Map<string, { user: UserRecord; expiresAt: number }>();
  private readonly USER_CACHE_TTL = 2 * 60 * 1000; // 2분

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly jwtTokenService: JwtTokenService,
    private readonly sessionService: SessionService,
    private readonly cacheService: CacheService,
    @Inject(forwardRef(() => SocialAuthService))
    private readonly socialAuthService: SocialAuthService,
  ) {}

  private getCachedEmail(identifier: string): string | null {
    const cached = this.identifierCache.get(identifier);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.identifierCache.delete(identifier);
      return null;
    }
    return cached.email;
  }

  private setCachedEmail(identifier: string, email: string): void {
    this.identifierCache.set(identifier, {
      email,
      expiresAt: Date.now() + this.IDENTIFIER_CACHE_TTL,
    });
    if (this.identifierCache.size > 1000) {
      const oldestKey = this.identifierCache.keys().next().value;
      if (oldestKey) {
        this.identifierCache.delete(oldestKey);
      }
    }
  }

  private async getIdentifierFromSharedCache(identifier: string): Promise<string | null> {
    const normalizedIdentifier = identifier.toLowerCase();
    const cached = this.getCachedEmail(normalizedIdentifier);
    if (cached) {
      return cached;
    }

    try {
      const sharedCache = await this.cacheService.get<string>(normalizedIdentifier, {
        prefix: this.IDENTIFIER_CACHE_REDIS_PREFIX,
      });
      if (sharedCache) {
        this.setCachedEmail(normalizedIdentifier, sharedCache);
        return sharedCache;
      }
    } catch (error) {
      this.logger.debug('Identifier cache lookup failed, continuing without shared cache', error as Error);
    }

    return null;
  }

  private rememberIdentifier(identifier: string, email: string): void {
    const normalizedIdentifier = identifier.toLowerCase();
    const normalizedEmail = email.toLowerCase();
    this.setCachedEmail(normalizedIdentifier, normalizedEmail);
    void this.cacheService.set(normalizedIdentifier, normalizedEmail, {
      prefix: this.IDENTIFIER_CACHE_REDIS_PREFIX,
      ttl: Math.floor(this.IDENTIFIER_CACHE_TTL / 1000),
    }).catch(() => {
      // Shared cache storing failure isn't critical; rely on in-memory cache.
    });
  }

  // bcrypt 캐시 관리 (성능 최적화)
  private getCachedBcryptResult(email: string, password: string): boolean | null {
    const cacheKey = `${email}:${password.substring(0, 8)}`;
    const cached = this.bcryptCache.get(cacheKey);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.bcryptCache.delete(cacheKey);
      return null;
    }

    return cached.hash === password;
  }

  private setCachedBcryptResult(email: string, password: string, isValid: boolean): void {
    if (!isValid) return; // 실패한 로그인은 캐시하지 않음

    const cacheKey = `${email}:${password.substring(0, 8)}`;
    this.bcryptCache.set(cacheKey, {
      hash: password,
      expiresAt: Date.now() + this.BCRYPT_CACHE_TTL,
    });

    // 캐시 크기 제한
    if (this.bcryptCache.size > 500) {
      const oldestKey = this.bcryptCache.keys().next().value;
      if (oldestKey) {
        this.bcryptCache.delete(oldestKey);
      }
    }
  }

  // 사용자 캐시 관리 (Redis 기반 재로그인 최적화)
  private async getCachedUser(email: string): Promise<UserRecord | null> {
    try {
      return await this.cacheService.get<UserRecord>(email, {
        prefix: 'user',
        ttl: 120, // 2분
      });
    } catch (error) {
      this.logger.warn('Failed to get cached user, continuing without cache', error);
      return null;
    }
  }

  private async setCachedUser(email: string, user: UserRecord): Promise<void> {
    try {
      // 보안상 패스워드 해시는 캐시하지 않음
      const sanitizedUser = { ...user, password_hash: '' };
      await this.cacheService.set(email, sanitizedUser, {
        prefix: 'user',
        ttl: 120, // 2분
      });
    } catch (error) {
      this.logger.warn('Failed to cache user, continuing without cache', error);
    }
  }

  public warmAuthCaches(user: UserRecord): void {
    const normalizedEmail = user.email.toLowerCase();
    this.rememberIdentifier(normalizedEmail, normalizedEmail);
    if (user.username) {
      this.rememberIdentifier(user.username.toLowerCase(), normalizedEmail);
    }
    const sanitizedUser = { ...user, password_hash: '' };
    void this.setCachedUser(normalizedEmail, sanitizedUser);
  }

  // 고성능 직접 인증: 캐시 우선 + 단일 쿼리로 사용자 정보 조회 및 비밀번호 확인
  private async authenticateUserDirect(
    identifier: string,
    password: string,
    options: { lookupType?: 'email' | 'username' | 'auto'; emailHint?: string } = {},
  ): Promise<UserRecord | null> {
    const authStartTime = Date.now();
    const lookupMode = options.lookupType ?? 'email';
    const cacheEmail =
      options.emailHint ??
      (identifier.includes('@') ? identifier.toLowerCase() : null);

    // 사용자 정보 캐시 확인 (Redis 기반 초고속)
    if (cacheEmail) {
      const cachedUser = await this.getCachedUser(cacheEmail);
      if (cachedUser) {
        // 캐시된 사용자로 비밀번호 검증
        const cachedBcryptResult = this.getCachedBcryptResult(cacheEmail, password);
        if (cachedBcryptResult === true) {
          this.logger.debug(`Full Redis cache hit for ${cacheEmail} - ultra fast auth`);
          return cachedUser;
        }
      }
    }

    const pool = await getPool();
    const shouldUseEmailLookup =
      lookupMode === 'email' || (lookupMode === 'auto' && identifier.includes('@'));
    const queryParam = shouldUseEmailLookup ? identifier.toLowerCase() : identifier;
    const selectWithPassword = `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           password_hash,
           role
         FROM profiles
         WHERE ${shouldUseEmailLookup ? 'email = $1' : 'username = $1'}
         LIMIT 1`;
    const selectWithoutPassword = `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           role
         FROM profiles
         WHERE ${shouldUseEmailLookup ? 'email = $1' : 'username = $1'}
         LIMIT 1`;
    const selectFallback = `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at
         FROM profiles
         WHERE ${shouldUseEmailLookup ? 'email = $1' : 'username = $1'}
         LIMIT 1`;

    let result;
    try {
      result = await pool.query(selectWithPassword, [queryParam]);
    } catch (error) {
      if (error instanceof Error && error.message.includes('password_hash')) {
        try {
          result = await pool.query(selectWithoutPassword, [queryParam]);
        } catch (innerError) {
          if (!(innerError instanceof Error) || !innerError.message.includes('role')) {
            throw innerError;
          }
          result = await pool.query(selectFallback, [queryParam]);
        }
      } else if (error instanceof Error && error.message.includes('role')) {
        result = await pool.query(selectFallback, [queryParam]);
      } else {
        throw error;
      }
    }

    const row = result.rows[0];
    if (!row) return null;
    const resolvedEmail = row.email?.toLowerCase();
    if (!resolvedEmail) {
      this.logger.warn('Profile row missing email, aborting authentication');
      return null;
    }

    // 비밀번호 확인을 병렬로 처리할 수 있도록 준비
    let isValidPassword = false;

    if (row.password_hash) {
      // bcrypt 캐시 확인 (초고속)
      const cachedResult = this.getCachedBcryptResult(resolvedEmail, password);
      if (cachedResult !== null) {
        isValidPassword = cachedResult;
        this.logger.debug(`bcrypt cache hit for ${resolvedEmail}`);
      } else {
        // bcrypt 검증 (캐시 미스 시)
        isValidPassword = await bcrypt.compare(password, row.password_hash);
        this.setCachedBcryptResult(resolvedEmail, password, isValidPassword);
      }
    } else {
      // Supabase 인증으로 폴백 (password_hash가 없는 경우)
      try {
        await this.supabaseService.signIn(resolvedEmail, password);
        isValidPassword = true;
      } catch {
        isValidPassword = false;
      }
    }

    if (!isValidPassword) return null;

    const authDuration = Date.now() - authStartTime;
    this.logger.debug(`Fast auth completed in ${authDuration}ms for ${resolvedEmail}`);

    const userRecord: UserRecord = {
      id: row.id,
      email: resolvedEmail,
      name: row.name,
      username: row.username,
      avatar_url: row.avatar_url,
      created_at: row.created_at,
      updated_at: row.updated_at,
      password_hash: '', // 보안상 빈 값으로 설정
      role: row.role ?? 'user',
    };

    // 성공한 인증 후 사용자 정보를 Redis 캐시에 저장
    void this.setCachedUser(resolvedEmail, userRecord);

    return userRecord;
  }

  async createAuthSession(user: UserRecord, loginType: LoginType): Promise<AuthSessionPayload> {
    const startTime = Date.now();

    // 세션 생성과 토큰 생성을 병렬로 처리 (성능 최적화)
    const [session] = await Promise.all([
      this.sessionService.createSession(user.id, loginType)
    ]);

    // 세션 ID를 받은 후 토큰 생성
    const tokenPair = this.jwtTokenService.generateTokenPair(user, loginType, session.sessionId);

    const duration = Date.now() - startTime;
    this.logger.debug(`Auth session created in ${duration}ms for user ${user.id}`);

    return { user, tokenPair, loginType, session };
  }

  async signup(input: SignupInput): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const lowerEmail = input.email.toLowerCase();

    // 모든 작업을 병렬로 처리 (성능 최적화)
    const [supabaseUser, passwordHash] = await Promise.all([
      this.supabaseService.signUp(lowerEmail, input.password, {
        name: input.name,
      }),
      bcrypt.hash(input.password, 4) // 6 -> 4로 더 단축 (로그인 성능 우선)
    ]);

    if (!supabaseUser) {
      throw new InternalServerErrorException('Supabase createUser did not return a user');
    }

    // username 생성 최적화
    const username = lowerEmail.includes('@')
      ? lowerEmail.split('@')[0].toLowerCase()
      : `user_${supabaseUser.id.substring(0, 8)}`;

    const newUser: UserRecord = {
      id: supabaseUser.id,
      email: lowerEmail,
      name: input.name ?? null,
      avatar_url: null,
      created_at: new Date(),
      updated_at: new Date(),
      username,
      password_hash: passwordHash,
      role: 'user',
    };

    // 세션 생성과 캐시 업데이트를 병렬로 처리
    const [result] = await Promise.all([
      this.createAuthSession(newUser, 'signup'),
      this.markLastLogin(newUser.id),
      // 캐시 업데이트는 동기적으로 빠르므로 Promise로 감쌀 필요 없음
      Promise.resolve().then(() => {
        this.warmAuthCaches(newUser);
      })
    ]);

    const duration = Date.now() - startTime;
    this.logger.debug(`Fast signup completed in ${duration}ms for ${lowerEmail}`);

    return result;
  }

  async login(input: LoginInput): Promise<AuthSessionPayload> {
    const startTime = Date.now();
    const identifier = input.identifier.trim().toLowerCase();
    if (!identifier) {
      throw new UnauthorizedException('identifier is required');
    }

    let loginType: LoginType = identifier.includes('@') ? 'email' : 'username';
    let lookupValue = identifier;
    let emailHint: string | undefined = loginType === 'email' ? identifier : undefined;

    // username 로그인 시 캐시 기반으로 이메일 힌트 확보 (없으면 username으로 직접 조회)
    if (loginType === 'username') {
      const cachedEmail = await this.getIdentifierFromSharedCache(identifier);
      if (cachedEmail) {
        lookupValue = cachedEmail;
        emailHint = cachedEmail;
      }
    }

    // 고성능 직접 인증: Supabase 대신 직접 DB 쿼리 (더 빠름)
    const user = await this.authenticateUserDirect(lookupValue, input.password, {
      lookupType: loginType === 'username' && !emailHint ? 'username' : 'email',
      emailHint,
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // 세션 생성과 캐시 업데이트를 병렬로 처리 (성능 최적화)
    const [result] = await Promise.all([
      this.createAuthSession(user, loginType),
      this.markLastLogin(user.id),
      // 캐시 업데이트를 백그라운드에서 처리
      Promise.resolve().then(() => {
        this.warmAuthCaches(user);
      })
    ]);

    const duration = Date.now() - startTime;
    this.logger.debug(`Fast login completed in ${duration}ms for ${identifier}`);

    return result;
  }

  async refresh(refreshToken: string): Promise<RefreshPayload> {
    const payload = this.jwtTokenService.verifyRefreshToken(refreshToken);
    if (!payload.sub || !payload.sessionId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const currentSession = await this.sessionService.getSession(payload.sessionId);
    if (!currentSession || !currentSession.isActive) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    let user: UserRecord;
    try {
      const pool = await getPool();
      const profile = await pool.query(
        `SELECT
           id::text,
           email,
           name,
           username,
           avatar_url,
           created_at,
           updated_at,
           role
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [payload.sub],
      );
      const row = profile.rows[0];

      if (row) {
        user = {
          id: row.id,
          email: row.email,
          name: row.name,
          avatar_url: row.avatar_url,
          username: row.username,
          created_at: row.created_at,
          updated_at: row.updated_at,
          password_hash: '',
          role: row.role ?? 'user',
        };
      } else {
        const supabaseUser = await this.supabaseService.getUserById(payload.sub);
        if (!supabaseUser) {
          throw new UnauthorizedException('User not found in Supabase');
        }
        user = fromSupabaseUser(supabaseUser);
      }
    } catch (error) {
      throw new UnauthorizedException('User verification failed');
    }

    // 기존 세션은 재사용하지 않으므로 즉시 폐기
    await this.sessionService.deleteSession(payload.sessionId);

    const sessionPayload = await this.createAuthSession(user, 'email');
    return { tokenPair: sessionPayload.tokenPair, loginType: sessionPayload.loginType, session: sessionPayload.session };
  }

  async deleteAccount(user: UserRecord, loginTypeHint?: LoginType): Promise<{ supabaseDeleted: boolean }> {
    const startTime = Date.now();

    const pool = await getPool();

    // 프로필 타입 조회 (DB 우선, 실패 시 Supabase)
    let avatarUrl: string | null = user.avatar_url ?? null;
    let profileLoginType: LoginType | null = null;
    let appleRefreshToken: string | null = null;
    let googleRefreshToken: string | null = null;

    try {
      const directProfile = await pool.query(
        `SELECT login_type, apple_refresh_token, google_refresh_token, avatar_url
         FROM profiles
         WHERE id = $1
         LIMIT 1`,
        [user.id],
      );
      const profileRow = directProfile.rows[0];
      if (profileRow) {
        profileLoginType = (profileRow.login_type as LoginType | null) ?? null;
        appleRefreshToken = (profileRow.apple_refresh_token as string | null) ?? null;
        googleRefreshToken = (profileRow.google_refresh_token as string | null) ?? null;
        avatarUrl = avatarUrl ?? (profileRow.avatar_url as string | null);
      }
    } catch (error) {
      this.logger.warn('[deleteAccount] Failed to fetch profile login type from DB', error as Error);
    }
    if (!profileLoginType) {
      try {
        const profile = await this.supabaseService.findProfileById(user.id);
        profileLoginType = (profile?.login_type as LoginType | null) ?? null;
        avatarUrl = avatarUrl ?? (profile?.avatar_url as string | null) ?? null;
      } catch (error) {
        this.logger.warn('[deleteAccount] Failed to fetch profile login type via Supabase', error as Error);
      }
    }
    if (!profileLoginType) {
      if (appleRefreshToken) {
        profileLoginType = 'apple';
      } else if (googleRefreshToken) {
        profileLoginType = 'google';
      }
    }
    if (!profileLoginType && loginTypeHint) {
      profileLoginType = loginTypeHint;
    }

    if (profileLoginType === 'apple' && !appleRefreshToken) {
      try {
        appleRefreshToken = await this.supabaseService.getAppleRefreshToken(user.id);
      } catch (error) {
        this.logger.warn('[deleteAccount] Failed to load Apple refresh token', error as Error);
      }
    } else if (profileLoginType === 'google' && !googleRefreshToken) {
      try {
        googleRefreshToken = await this.supabaseService.getGoogleRefreshToken(user.id);
      } catch (error) {
        this.logger.warn('[deleteAccount] Failed to load Google refresh token', error as Error);
      }
    }

    await (async () => {
      if (profileLoginType === 'apple') {
        if (appleRefreshToken) {
          try {
            await this.socialAuthService.revokeAppleConnection(user.id, appleRefreshToken);
          } catch (error) {
            this.logger.warn('[deleteAccount] Apple revoke failed', error);
          }
        } else {
          this.logger.warn('[deleteAccount] Apple refresh token missing, skipping revoke');
        }
      } else if (profileLoginType === 'google') {
        if (googleRefreshToken) {
          try {
            await this.socialAuthService.revokeGoogleConnection(user.id, googleRefreshToken);
          } catch (error) {
            this.logger.warn('[deleteAccount] Google revoke failed', error);
          }
        } else {
          this.logger.warn('[deleteAccount] Google refresh token missing, skipping revoke');
        }
      }
    })();

    const localCleanup = (async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `DELETE FROM travel_expense_participants
           WHERE member_id = $1
              OR expense_id IN (
                SELECT id FROM travel_expenses WHERE payer_id = $1
              )`,
          [user.id],
        );
        await client.query('DELETE FROM travel_expenses WHERE payer_id = $1', [user.id]);
        await client.query('DELETE FROM travel_members WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM travel_invites WHERE created_by = $1', [user.id]);
        await client.query('DELETE FROM travel_settlements WHERE from_member = $1 OR to_member = $1', [user.id]);
        await client.query('DELETE FROM user_sessions WHERE user_id = $1', [user.id]);
        await client.query('DELETE FROM profiles WHERE id = $1', [user.id]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    })();

    // 4) Supabase 사용자 삭제
    let supabaseDeleted = false;
    const supabaseDeletion = (async () => {
      try {
        await this.supabaseService.deleteUser(user.id);
        supabaseDeleted = true;
      } catch (error) {
        const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
        if (!message.includes('not found')) {
          this.logger.warn('[deleteAccount] Supabase deletion failed', error);
        } else {
          supabaseDeleted = true;
        }
      }
    })();

    // 캐시에서도 제거
    this.identifierCache.delete(user.email.toLowerCase());
    if (user.username) {
      this.identifierCache.delete(user.username.toLowerCase());
    }

    const cacheCleanup = Promise.all([
      // OAuth 캐시 정리
      this.socialAuthService.invalidateOAuthCacheByUser(user.id)
        .catch((error) => this.logger.warn('[deleteAccount] OAuth cache cleanup failed', error as Error)),

      // 사용자 관련 모든 캐시 무효화 (새로운 Redis 캐시 무효화 전략)
      this.cacheService.invalidateUserCache(user.id)
        .catch((error) => this.logger.warn('[deleteAccount] User cache invalidation failed', error as Error)),
    ]);

    const profileImageDeletion = this.supabaseService.deleteProfileImage(avatarUrl)
      .catch((error) => this.logger.warn('[deleteAccount] Profile image deletion failed', error as Error));

    await Promise.all([localCleanup, supabaseDeletion, cacheCleanup, profileImageDeletion]);

    const duration = Date.now() - startTime;
    this.logger.debug(`Fast account deletion completed in ${duration}ms for ${user.email}`);

    return { supabaseDeleted };
  }

  async markLastLogin(userId: string): Promise<void> {
    try {
      const pool = await getPool();
      await pool.query(
        `UPDATE profiles
         SET updated_at = NOW()
         WHERE id = $1`,
        [userId],
      );
    } catch (error) {
      this.logger.warn(`[markLastLogin] Failed to update last login for user ${userId}`, error as Error);
    }
  }

  async logoutBySessionId(sessionId: string): Promise<{ revoked: boolean }> {
    if (!sessionId) {
      throw new UnauthorizedException('sessionId is required');
    }
    const deleted = await this.sessionService.deleteSession(sessionId);
    return { revoked: deleted };
  }
}
