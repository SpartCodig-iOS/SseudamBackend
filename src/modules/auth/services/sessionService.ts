import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { randomUUID } from 'crypto';
import { LoginType } from '../../../types/auth';
import { SupabaseService } from '../../core/services/supabaseService';
import { CacheService } from '../../cache-shared/services/cacheService';
import { UserSession } from '../../../entities/user-session.entity';

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
  supabaseSessionValid?: boolean; // Supabase 세션 유효성
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly defaultTTLHours = 24 * 30;
  private readonly CLEANUP_INTERVAL_MS = process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 45 * 60 * 1000; // Railway Sleep 친화적: 운영 1시간, 개발 45분
  private lastCleanupRun = 0;

  constructor(
    @InjectRepository(UserSession)
    private readonly sessionRepository: Repository<UserSession>,
    private readonly supabaseService: SupabaseService,
    private readonly cacheService: CacheService,
  ) {}

  // 세션 캐시: 10분 TTL, 최대 2000개 세션
  private readonly sessionCache = new Map<string, { data: SessionRecord; expiresAt: number }>();
  private readonly SESSION_CACHE_TTL = 15 * 60 * 1000; // 15분으로 확대해 캐시 적중률 향상
  private readonly MAX_CACHE_SIZE = 2000;
  private readonly SESSION_REDIS_PREFIX = 'session';
  private readonly SESSION_REDIS_TTL = 15 * 60; // 15분
  private readonly SESSION_USER_INDEX_PREFIX = 'session:user';
  // Supabase 세션 유효성 캐시: 5분 TTL
  private readonly supabaseValidityCache = new Map<string, { valid: boolean; expiresAt: number }>();
  private readonly SUPABASE_VALIDITY_TTL = 5 * 60 * 1000;
  private readonly SUPABASE_VALIDITY_REDIS_PREFIX = 'session:valid';
  private readonly SUPABASE_VALIDITY_REDIS_TTL = 5 * 60;
  private indexesEnsured = false;

  // TypeORM을 사용하므로 인덱스는 Entity 데코레이터로 관리됨
  private async ensureIndexes(): Promise<void> {
    // TypeORM에서 @Index 데코레이터로 관리하므로 별도 로직 불필요
    this.indexesEnsured = true;
  }

  private async attachSupabaseValidity(sessionId: string, session: SessionRecord): Promise<SessionRecord> {
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

    // 낙관적 반환 후 백그라운드 검증으로 응답 지연 최소화
    session.supabaseSessionValid = true;
    this.refreshSupabaseValidity(sessionId, session.userId).catch((err) =>
      this.logger.warn(`Background Supabase validity check failed for session ${sessionId}`, err as Error)
    );
    return session;
  }

  // 세션 캐시 관리
  private getCachedSession(sessionId: string): SessionRecord | null {
    const cached = this.sessionCache.get(sessionId);
    if (!cached) return null;

    if (Date.now() > cached.expiresAt) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    // 세션이 만료되었는지 확인
    if (new Date(cached.data.expiresAt) <= new Date()) {
      this.sessionCache.delete(sessionId);
      return null;
    }

    return cached.data;
  }

  private setCachedSession(sessionId: string, session: SessionRecord): void {
    // 캐시 크기 제한
    if (this.sessionCache.size >= this.MAX_CACHE_SIZE) {
      // 가장 오래된 항목들 제거 (최대 100개씩)
      const entries = Array.from(this.sessionCache.entries());
      const toDelete = entries.slice(0, Math.min(100, entries.length));
      toDelete.forEach(([key]) => this.sessionCache.delete(key));
    }

    this.sessionCache.set(sessionId, {
      data: session,
      expiresAt: Date.now() + this.SESSION_CACHE_TTL
    });

    // Redis에도 캐싱해 재시작 후에도 빠른 조회
    this.setRedisSession(sessionId, session);
  }

  private clearCachedSession(sessionId: string): void {
    this.sessionCache.delete(sessionId);
    this.cacheService.del(sessionId, { prefix: this.SESSION_REDIS_PREFIX }).catch(() => undefined);
  }

  private clearUserSessions(userId: string): void {
    // 특정 사용자의 모든 세션을 캐시에서 제거
    for (const [sessionId, cached] of this.sessionCache.entries()) {
      if (cached.data.userId === userId) {
        this.sessionCache.delete(sessionId);
      }
    }
    // Redis 세션 인덱스 기반 삭제
    this.cacheService.get<string[]>(userId, { prefix: this.SESSION_USER_INDEX_PREFIX })
      .then(async (sessionIds) => {
        if (!sessionIds || sessionIds.length === 0) return;
        await Promise.all(
          sessionIds.map(id => this.cacheService.del(id, { prefix: this.SESSION_REDIS_PREFIX }).catch(() => undefined))
        );
        await this.cacheService.del(userId, { prefix: this.SESSION_USER_INDEX_PREFIX }).catch(() => undefined);
      })
      .catch(() => undefined);
  }

  private async getRedisSession(sessionId: string): Promise<SessionRecord | null> {
    try {
      return await this.cacheService.get<SessionRecord>(sessionId, {
        prefix: this.SESSION_REDIS_PREFIX,
      });
    } catch (error) {
      this.logger.warn(`Redis session get failed for ${sessionId}: ${(error as Error).message}`);
      return null;
    }
  }

  private async setRedisSession(sessionId: string, session: SessionRecord): Promise<void> {
    try {
      await this.cacheService.set(sessionId, session, {
        prefix: this.SESSION_REDIS_PREFIX,
        ttl: this.SESSION_REDIS_TTL,
      });
      // 사용자별 세션 인덱스에 세션 ID 추가
      const indexKey = session.userId;
      const existing = (await this.cacheService.get<string[]>(indexKey, { prefix: this.SESSION_USER_INDEX_PREFIX })) ?? [];
      const updated = Array.from(new Set([sessionId, ...existing])).slice(0, 20);
      await this.cacheService.set(indexKey, updated, {
        prefix: this.SESSION_USER_INDEX_PREFIX,
        ttl: this.SESSION_REDIS_TTL,
      });
    } catch {
      // Redis 실패는 무시
    }
  }

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

    // 캐시 크기 제한
    if (this.supabaseValidityCache.size > 2000) {
      const firstKey = this.supabaseValidityCache.keys().next().value;
      if (firstKey) this.supabaseValidityCache.delete(firstKey);
    }

    // Redis에도 캐싱
    this.cacheService.set(userId, valid, {
      prefix: this.SUPABASE_VALIDITY_REDIS_PREFIX,
      ttl: this.SUPABASE_VALIDITY_REDIS_TTL,
    }).catch(() => undefined);
  }

  /**
   * Supabase 세션 유효성 확인 (빠른 검증)
   */
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
      // ignore redis miss
    }

    try {
      // Supabase에서 사용자 정보 조회로 세션 유효성 확인
      const user = await this.supabaseService.getUserById(userId);
      const valid = !!user;
      this.setCachedSupabaseValidity(userId, valid);
      return valid;
    } catch (error) {
      this.logger.warn(`Supabase session check failed for user ${userId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.setCachedSupabaseValidity(userId, false);
      return false;
    }
  }

  private mapEntityToSession(entity: UserSession): SessionRecord {
    const now = new Date();
    const expiresDate = entity.expires_at;
    const revokedDate = entity.revoked_at;

    let status: SessionStatus = 'active';
    if (revokedDate) {
      status = 'revoked';
    } else if (expiresDate <= now) {
      status = 'expired';
    }

    return {
      sessionId: entity.session_id,
      userId: entity.user_id,
      loginType: entity.login_type as LoginType,
      createdAt: entity.created_at.toISOString(),
      lastSeenAt: entity.last_seen_at.toISOString(),
      expiresAt: entity.expires_at.toISOString(),
      revokedAt: entity.revoked_at?.toISOString() || null,
      status,
      isActive: status === 'active',
    };
  }

  // 기존 mapRowToSession을 호환성을 위해 유지 (필요시)
  private mapRowToSession(row: any): SessionRecord {
    const createdAt = row.created_at;
    const lastSeenAt = row.last_seen_at;
    const expiresAt = row.expires_at;
    const revokedAt = row.revoked_at ?? null;

    const now = new Date();
    const expiresDate = new Date(expiresAt);
    const revokedDate = revokedAt ? new Date(revokedAt) : null;

    let status: SessionStatus = 'active';
    if (revokedDate) {
      status = 'revoked';
    } else if (expiresDate <= now) {
      status = 'expired';
    }

    return {
      sessionId: row.session_id,
      userId: row.user_id,
      loginType: row.login_type,
      createdAt,
      lastSeenAt,
      expiresAt,
      revokedAt,
      status,
      isActive: status === 'active',
    };
  }

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
      const result = await this.sessionRepository.delete({
        expires_at: MoreThan(new Date())
      });

      if ((result.affected ?? 0) > 0) {
        this.logger.debug(`Cleaned up ${result.affected} expired sessions from storage`);
      }
    } catch (error) {
      this.logger.warn(`Failed to clean expired sessions: ${(error as Error).message}`);
    }
  }

  private scheduleCleanup(force = false): void {
    this.cleanupExpiredSessions(force).catch((err) =>
      this.logger.warn('Background session cleanup failed', err),
    );
  }

  async createSession(userId: string, loginType: LoginType): Promise<SessionRecord> {
    const startTime = Date.now();

    // 기존 사용자 세션들을 캐시에서 제거 (빠른 메모리 작업)
    this.clearUserSessions(userId);

    // 만료 세션 정리는 백그라운드로 (첫 로그인 속도 향상)
    this.scheduleCleanup();

    await this.ensureIndexes();
    const ttlHours = this.defaultTTLHours;
    const newSessionId = randomUUID();

    try {
      // 기존 사용자 세션 삭제 후 새 세션 생성
      await this.sessionRepository.delete({ user_id: userId });

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + ttlHours);

      const session = this.sessionRepository.create({
        session_id: newSessionId,
        user_id: userId,
        login_type: loginType,
        expires_at: expiresAt,
        last_seen_at: new Date(),
        created_at: new Date(),
        revoked_at: null,
      });

      const savedSession = await this.sessionRepository.save(session);

      const sessionRecord: SessionRecord = {
        sessionId: savedSession.session_id,
        userId: savedSession.user_id,
        loginType: savedSession.login_type as LoginType,
        createdAt: savedSession.created_at.toISOString(),
        lastSeenAt: savedSession.last_seen_at.toISOString(),
        expiresAt: savedSession.expires_at.toISOString(),
        revokedAt: savedSession.revoked_at?.toISOString() || null,
        status: 'active',
        isActive: true,
      };

      // 새 세션을 캐시에 저장
      this.setCachedSession(sessionRecord.sessionId, sessionRecord);

      const duration = Date.now() - startTime;
      this.logger.debug(`Ultra-fast session created in ${duration}ms for user ${userId}`);

      return sessionRecord;
    } catch (error) {
      this.logger.error(`Fast session creation failed for user ${userId}`, error);
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<SessionRecord | null> {
    this.scheduleCleanup();

    // 캐시에서 먼저 확인
    const cachedSession = this.getCachedSession(sessionId);
    if (cachedSession) {
      return this.attachSupabaseValidity(sessionId, cachedSession);
    }

    // Redis 캐시 확인
    const redisSession = await this.getRedisSession(sessionId);
    if (redisSession) {
      // 만료된 세션은 캐시에서 제거
      if (new Date(redisSession.expiresAt) <= new Date()) {
        this.clearCachedSession(sessionId);
        return null;
      }
      const hydrated = await this.attachSupabaseValidity(sessionId, redisSession);
      this.setCachedSession(sessionId, hydrated);
      return hydrated;
    }

    // TypeORM을 사용한 조회
    const sessionEntity = await this.sessionRepository.findOne({
      where: { session_id: sessionId }
    });

    if (!sessionEntity) return null;

    const session = this.mapEntityToSession(sessionEntity);

    const hydrated = await this.attachSupabaseValidity(sessionId, session);

    // 캐시에 저장
    this.setCachedSession(sessionId, hydrated);

    return hydrated;
  }

  async touchSession(sessionId: string): Promise<void> {
    this.scheduleCleanup();

    // TypeORM을 사용한 업데이트
    await this.sessionRepository.update(
      {
        session_id: sessionId,
        revoked_at: null,
        expires_at: MoreThan(new Date())
      },
      { last_seen_at: new Date() }
    );

    // 캐시에서 세션 업데이트
    const cached = this.sessionCache.get(sessionId);
    if (cached && cached.data.isActive) {
      cached.data.lastSeenAt = new Date().toISOString();
    }

    // Redis 캐시도 갱신
    const redisSession = await this.getRedisSession(sessionId);
    if (redisSession && redisSession.isActive) {
      redisSession.lastSeenAt = new Date().toISOString();
      this.setRedisSession(sessionId, redisSession);
    }
  }

  private async refreshSupabaseValidity(sessionId: string, userId: string): Promise<void> {
    const supabaseValid = await this.checkSupabaseSession(userId);
    this.setCachedSupabaseValidity(userId, supabaseValid);

    if (!supabaseValid) {
      // 로컬 캐시 업데이트
      const cached = this.sessionCache.get(sessionId);
      if (cached) {
        cached.data.status = 'revoked';
        cached.data.isActive = false;
        cached.data.supabaseSessionValid = false;
      }
      // DB에서도 상태 업데이트 (백그라운드)
      this.sessionRepository.update(
        { session_id: sessionId },
        { revoked_at: new Date() }
      ).catch(err =>
        this.logger.warn(`Failed to update revoked session in DB: ${err.message}`)
      );
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    await this.cleanupExpiredSessions();

    // 캐시에서 제거하여 다음 조회 시 최신 상태를 다시 읽도록 함
    this.clearCachedSession(sessionId);

    // TypeORM을 사용한 세션 무효화
    const result = await this.sessionRepository.update(
      {
        session_id: sessionId,
        revoked_at: null
      },
      {
        revoked_at: new Date(),
        last_seen_at: new Date()
      }
    );

    if ((result.affected ?? 0) > 0) {
      return true;
    }

    // 세션 존재 여부 확인
    const exists = await this.sessionRepository.count({
      where: { session_id: sessionId }
    });

    return exists > 0;
  }

  async deleteUserSessions(userId: string): Promise<number> {
    await this.cleanupExpiredSessions();

    // 캐시에서 사용자의 모든 세션 제거
    this.clearUserSessions(userId);

    // TypeORM을 사용한 사용자 세션 삭제
    const result = await this.sessionRepository.delete({ user_id: userId });
    return result.affected ?? 0;
  }
}
