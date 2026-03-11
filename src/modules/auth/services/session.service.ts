import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { LoginType } from '../types/auth.types';
import { SupabaseService } from '../../../common/services/supabase.service';
import { CacheService } from '../../../common/services/cache.service';
import { SessionRepository } from '../repositories/session.repository';
import { UserSession } from '../entities/user-session.entity';

export type SessionStatus = 'active' | 'revoked' | 'expired';

export interface SessionRecord {
  sessionId: string;
  userId: string;
  loginType: LoginType;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  status: SessionStatus;
  isActive: boolean;
  supabaseSessionValid?: boolean;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultTTLHours = 24 * 30;
  private readonly CLEANUP_INTERVAL_MS =
    process.env.NODE_ENV === 'production'
      ? 60 * 60 * 1000  // 운영: 1시간
      : 45 * 60 * 1000; // 개발: 45분
  private lastCleanupRun = 0;

  // 인메모리 세션 캐시
  private readonly sessionCache = new Map<
    string,
    { data: SessionRecord; expiresAt: number }
  >();
  private readonly SESSION_CACHE_TTL = 15 * 60 * 1000;   // 15분
  private readonly MAX_CACHE_SIZE = 2000;
  private readonly SESSION_REDIS_PREFIX = 'session';
  private readonly SESSION_REDIS_TTL = 15 * 60;           // 15분
  private readonly SESSION_USER_INDEX_PREFIX = 'session:user';

  // Supabase 세션 유효성 캐시
  private readonly supabaseValidityCache = new Map<
    string,
    { valid: boolean; expiresAt: number }
  >();
  private readonly SUPABASE_VALIDITY_TTL = 5 * 60 * 1000; // 5분
  private readonly SUPABASE_VALIDITY_REDIS_PREFIX = 'session:valid';
  private readonly SUPABASE_VALIDITY_REDIS_TTL = 5 * 60;   // 5분

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly cacheService: CacheService,
    private readonly sessionRepository: SessionRepository,
  ) {}

  // ─── 엔티티 → SessionRecord 변환 ─────────────────────────────

  private mapEntityToRecord(entity: UserSession): SessionRecord {
    const now = new Date();
    const expiresDate = new Date(entity.expires_at);
    const revokedDate = entity.revoked_at ? new Date(entity.revoked_at) : null;

    let status: SessionStatus = 'active';
    if (revokedDate) {
      status = 'revoked';
    } else if (expiresDate <= now) {
      status = 'expired';
    }

    return {
      sessionId: entity.session_id,
      userId: entity.user_id,
      loginType: entity.login_type,
      createdAt: entity.created_at.toISOString(),
      lastSeenAt: entity.last_seen_at.toISOString(),
      expiresAt: entity.expires_at.toISOString(),
      revokedAt: revokedDate ? revokedDate.toISOString() : null,
      status,
      isActive: status === 'active',
    };
  }

  // ─── 인메모리 캐시 관리 ──────────────────────────────────────

  private getCachedSession(sessionId: string): SessionRecord | null {
    const cached = this.sessionCache.get(sessionId);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    if (new Date(cached.data.expiresAt) <= new Date()) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    return cached.data;
  }

  private setCachedSession(sessionId: string, session: SessionRecord): void {
    if (this.sessionCache.size >= this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.sessionCache.entries());
      const toDelete = entries.slice(0, Math.min(100, entries.length));
      toDelete.forEach(([key]) => this.sessionCache.delete(key));
    }

    this.sessionCache.set(sessionId, {
      data: session,
      expiresAt: Date.now() + this.SESSION_CACHE_TTL,
    });

    this.setRedisSession(sessionId, session);
  }

  private clearCachedSession(sessionId: string): void {
    this.sessionCache.delete(sessionId);
    this.cacheService
      .del(sessionId, { prefix: this.SESSION_REDIS_PREFIX })
      .catch(() => undefined);
  }

  private clearUserSessions(userId: string): void {
    for (const [sessionId, cached] of this.sessionCache.entries()) {
      if (cached.data.userId === userId) {
        this.sessionCache.delete(sessionId);
      }
    }

    this.cacheService
      .get<string[]>(userId, { prefix: this.SESSION_USER_INDEX_PREFIX })
      .then(async (sessionIds) => {
        if (!sessionIds?.length) return;
        await Promise.all(
          sessionIds.map((id) =>
            this.cacheService
              .del(id, { prefix: this.SESSION_REDIS_PREFIX })
              .catch(() => undefined),
          ),
        );
        await this.cacheService
          .del(userId, { prefix: this.SESSION_USER_INDEX_PREFIX })
          .catch(() => undefined);
      })
      .catch(() => undefined);
  }

  // ─── Redis 캐시 관리 ─────────────────────────────────────────

  private async getRedisSession(sessionId: string): Promise<SessionRecord | null> {
    try {
      return await this.cacheService.get<SessionRecord>(sessionId, {
        prefix: this.SESSION_REDIS_PREFIX,
      });
    } catch (error) {
      this.logger.warn(
        `Redis session get failed for ${sessionId}: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async setRedisSession(
    sessionId: string,
    session: SessionRecord,
  ): Promise<void> {
    try {
      await this.cacheService.set(sessionId, session, {
        prefix: this.SESSION_REDIS_PREFIX,
        ttl: this.SESSION_REDIS_TTL,
      });

      const indexKey = session.userId;
      const existing =
        (await this.cacheService.get<string[]>(indexKey, {
          prefix: this.SESSION_USER_INDEX_PREFIX,
        })) ?? [];
      const updated = Array.from(new Set([sessionId, ...existing])).slice(0, 20);
      await this.cacheService.set(indexKey, updated, {
        prefix: this.SESSION_USER_INDEX_PREFIX,
        ttl: this.SESSION_REDIS_TTL,
      });
    } catch {
      // Redis 실패 무시
    }
  }

  // ─── Supabase 유효성 캐시 ────────────────────────────────────

  private getCachedSupabaseValidity(userId: string): boolean | null {
    const cached = this.supabaseValidityCache.get(userId);
    if (cached && Date.now() <= cached.expiresAt) {
      return cached.valid;
    }
    return null;
  }

  private setCachedSupabaseValidity(userId: string, valid: boolean): void {
    this.supabaseValidityCache.set(userId, {
      valid,
      expiresAt: Date.now() + this.SUPABASE_VALIDITY_TTL,
    });

    if (this.supabaseValidityCache.size > 2000) {
      const firstKey = this.supabaseValidityCache.keys().next().value;
      if (firstKey) this.supabaseValidityCache.delete(firstKey);
    }

    this.cacheService
      .set(userId, valid, {
        prefix: this.SUPABASE_VALIDITY_REDIS_PREFIX,
        ttl: this.SUPABASE_VALIDITY_REDIS_TTL,
      })
      .catch(() => undefined);
  }

  private async checkSupabaseSession(userId: string): Promise<boolean> {
    const cached = this.getCachedSupabaseValidity(userId);
    if (cached !== null) return cached;

    try {
      const redisValidity = await this.cacheService.get<boolean>(userId, {
        prefix: this.SUPABASE_VALIDITY_REDIS_PREFIX,
      });
      if (typeof redisValidity === 'boolean') {
        this.setCachedSupabaseValidity(userId, redisValidity);
        return redisValidity;
      }
    } catch {
      // Redis miss 무시
    }

    try {
      const user = await this.supabaseService.getUserById(userId);
      const valid = !!user;
      this.setCachedSupabaseValidity(userId, valid);
      return valid;
    } catch (error) {
      this.logger.warn(
        `Supabase session check failed for user ${userId}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );
      this.setCachedSupabaseValidity(userId, false);
      return false;
    }
  }

  private async attachSupabaseValidity(
    sessionId: string,
    session: SessionRecord,
  ): Promise<SessionRecord> {
    if (!session.isActive) return session;

    const cachedValidity = this.getCachedSupabaseValidity(session.userId);
    if (cachedValidity !== null) {
      session.supabaseSessionValid = cachedValidity;
      if (!cachedValidity) {
        session.status = 'revoked';
        session.isActive = false;
      }
      return session;
    }

    // 낙관적 반환 후 백그라운드에서 검증 (응답 지연 최소화)
    session.supabaseSessionValid = true;
    this.refreshSupabaseValidity(sessionId, session.userId).catch((err) =>
      this.logger.warn(
        `Background Supabase validity check failed for session ${sessionId}`,
        err as Error,
      ),
    );
    return session;
  }

  private async refreshSupabaseValidity(
    sessionId: string,
    userId: string,
  ): Promise<void> {
    const supabaseValid = await this.checkSupabaseSession(userId);
    this.setCachedSupabaseValidity(userId, supabaseValid);

    if (!supabaseValid) {
      // 인메모리 캐시 업데이트
      const cached = this.sessionCache.get(sessionId);
      if (cached) {
        cached.data.status = 'revoked';
        cached.data.isActive = false;
        cached.data.supabaseSessionValid = false;
      }

      // DB 업데이트 (백그라운드, fire-and-forget)
      this.sessionRepository.markAsRevoked(sessionId).catch((err: Error) =>
        this.logger.warn(
          `Failed to update revoked session in DB: ${err.message}`,
        ),
      );
    }
  }

  // ─── 만료 세션 정리 ──────────────────────────────────────────

  private purgeExpiredCacheEntries(): void {
    const now = new Date();
    for (const [sessionId, cached] of this.sessionCache.entries()) {
      if (new Date(cached.data.expiresAt) <= now) {
        this.sessionCache.delete(sessionId);
      }
    }
  }

  private async cleanupExpiredSessions(force = false): Promise<void> {
    this.purgeExpiredCacheEntries();

    const now = Date.now();
    if (!force && now - this.lastCleanupRun < this.CLEANUP_INTERVAL_MS) {
      return;
    }

    this.lastCleanupRun = now;

    try {
      const deleted = await this.sessionRepository.deleteExpiredSessions();
      if (deleted > 0) {
        this.logger.debug(`Cleaned up ${deleted} expired sessions from storage`);
      }
    } catch (error) {
      this.logger.warn(
        `Failed to clean expired sessions: ${(error as Error).message}`,
      );
    }
  }

  private scheduleCleanup(force = false): void {
    this.cleanupExpiredSessions(force).catch((err) =>
      this.logger.warn('Background session cleanup failed', err),
    );
  }

  // ─── 공개 API ────────────────────────────────────────────────

  /**
   * 새 세션을 생성하거나 기존 세션을 갱신합니다.
   * user_id UNIQUE 제약을 이용한 Upsert 방식으로 중복 없이 처리합니다.
   */
  async createSession(userId: string, loginType: LoginType): Promise<SessionRecord> {
    const startTime = Date.now();

    this.clearUserSessions(userId);
    this.scheduleCleanup();

    const newSessionId = randomUUID();

    try {
      const entity = await this.sessionRepository.upsertSession({
        sessionId: newSessionId,
        userId,
        loginType,
        ttlHours: this.defaultTTLHours,
      });

      const session = this.mapEntityToRecord(entity);
      this.setCachedSession(session.sessionId, session);

      const duration = Date.now() - startTime;
      this.logger.debug(
        `Session created in ${duration}ms for user ${userId}`,
      );

      return session;
    } catch (error) {
      this.logger.error(`Session creation failed for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * 세션 ID로 세션을 조회합니다.
   * 인메모리 → Redis → DB 순서로 확인합니다.
   */
  async getSession(sessionId: string): Promise<SessionRecord | null> {
    this.scheduleCleanup();

    // 1. 인메모리 캐시
    const cachedSession = this.getCachedSession(sessionId);
    if (cachedSession) {
      return this.attachSupabaseValidity(sessionId, cachedSession);
    }

    // 2. Redis 캐시
    const redisSession = await this.getRedisSession(sessionId);
    if (redisSession) {
      if (new Date(redisSession.expiresAt) <= new Date()) {
        this.clearCachedSession(sessionId);
        return null;
      }
      const hydrated = await this.attachSupabaseValidity(sessionId, redisSession);
      this.setCachedSession(sessionId, hydrated);
      return hydrated;
    }

    // 3. DB 조회
    const entity = await this.sessionRepository.findBySessionId(sessionId);
    if (!entity) return null;

    const session = this.mapEntityToRecord(entity);
    const hydrated = await this.attachSupabaseValidity(sessionId, session);

    this.setCachedSession(sessionId, hydrated);

    return hydrated;
  }

  /**
   * 세션의 last_seen_at을 현재 시각으로 갱신합니다.
   */
  async touchSession(sessionId: string): Promise<void> {
    this.scheduleCleanup();

    await this.sessionRepository.touchSession(sessionId);

    // 인메모리 캐시 동기 갱신
    const cached = this.sessionCache.get(sessionId);
    if (cached?.data.isActive) {
      cached.data.lastSeenAt = new Date().toISOString();
    }

    // Redis 캐시 비동기 갱신
    this.getRedisSession(sessionId)
      .then((redisSession) => {
        if (redisSession?.isActive) {
          redisSession.lastSeenAt = new Date().toISOString();
          this.setRedisSession(sessionId, redisSession);
        }
      })
      .catch(() => undefined);
  }

  /**
   * 특정 세션을 폐기(revoke)합니다.
   * revoked_at을 현재 시각으로 설정하며, 이미 폐기된 세션이어도 true를 반환합니다.
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    await this.cleanupExpiredSessions();

    this.clearCachedSession(sessionId);

    const affected = await this.sessionRepository.revokeSession(sessionId);
    if (affected > 0) return true;

    // 이미 폐기됐거나 없는 경우 존재 여부로 판단
    return this.sessionRepository.existsBySessionId(sessionId);
  }

  /**
   * 특정 사용자의 모든 세션을 물리 삭제합니다.
   */
  async deleteUserSessions(userId: string): Promise<number> {
    await this.cleanupExpiredSessions();

    this.clearUserSessions(userId);

    return this.sessionRepository.deleteByUserId(userId);
  }
}
