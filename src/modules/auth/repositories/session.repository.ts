import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserSession } from '../entities/user-session.entity';
import { LoginType } from '../types/auth.types';

/**
 * SessionRepository
 *
 * UserSession은 PK가 session_id(uuid)이므로 BaseRepository<T extends { id: string }>
 * 제약을 만족하지 못합니다. 따라서 BaseRepository를 상속하지 않고
 * 필요한 메서드를 직접 구현합니다.
 */
@Injectable()
export class SessionRepository {
  constructor(
    @InjectRepository(UserSession)
    private readonly repository: Repository<UserSession>,
  ) {}

  getRepository(): Repository<UserSession> {
    return this.repository;
  }

  /**
   * 세션 ID로 단건 조회.
   * 만료·취소 여부와 관계없이 원본 행을 반환합니다.
   */
  async findBySessionId(sessionId: string): Promise<UserSession | null> {
    return this.repository.findOne({
      where: { session_id: sessionId },
    });
  }

  /**
   * 사용자 ID로 세션 조회 (user_id UNIQUE 이므로 항상 최대 1건).
   */
  async findByUserId(userId: string): Promise<UserSession | null> {
    return this.repository.findOne({
      where: { user_id: userId },
    });
  }

  /**
   * 세션 Upsert.
   * user_id 컬럼의 UNIQUE 제약을 이용해 기존 세션을 갱신하거나 신규 생성합니다.
   * RETURNING 절로 삽입/갱신된 행을 즉시 반환합니다.
   */
  async upsertSession(params: {
    sessionId: string;
    userId: string;
    loginType: LoginType;
    ttlHours: number;
  }): Promise<UserSession> {
    const { sessionId, userId, loginType, ttlHours } = params;

    await this.repository
      .createQueryBuilder()
      .insert()
      .into(UserSession)
      .values({
        session_id: sessionId,
        user_id: userId,
        login_type: loginType,
        expires_at: () => `NOW() + make_interval(hours => ${ttlHours})`,
        last_seen_at: () => 'NOW()',
        revoked_at: undefined,
      })
      .orUpdate(
        ['session_id', 'login_type', 'expires_at', 'last_seen_at', 'revoked_at'],
        ['user_id'],
      )
      .execute();

    // orUpdate 후 갱신된 행을 session_id로 재조회합니다.
    const result = await this.repository.findOne({
      where: { session_id: sessionId },
    });

    if (!result) {
      throw new Error(`Session upsert succeeded but row not found: ${sessionId}`);
    }

    return result;
  }

  /**
   * last_seen_at을 현재 시각으로 갱신.
   * revoked_at IS NULL이고 expires_at > NOW()인 세션만 갱신합니다.
   */
  async touchSession(sessionId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(UserSession)
      .set({ last_seen_at: () => 'NOW()' })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('revoked_at IS NULL')
      .andWhere('expires_at > NOW()')
      .execute();
  }

  /**
   * 세션을 revoke(논리 삭제).
   * revoked_at = NOW()로 표시하고 영향 행 수를 반환합니다.
   */
  async revokeSession(sessionId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(UserSession)
      .set({
        revoked_at: () => 'NOW()',
        last_seen_at: () => 'NOW()',
      })
      .where('session_id = :sessionId', { sessionId })
      .andWhere('revoked_at IS NULL')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * 세션이 DB에 존재하는지 확인합니다 (revoke 여부 무관).
   */
  async existsBySessionId(sessionId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { session_id: sessionId },
    });
    return count > 0;
  }

  /**
   * 세션 ID로 revoked_at = NOW() 백그라운드 업데이트 (fire-and-forget).
   * Supabase 세션 무효화 시 호출됩니다.
   */
  async markAsRevoked(sessionId: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(UserSession)
      .set({ revoked_at: () => 'NOW()' })
      .where('session_id = :sessionId', { sessionId })
      .execute();
  }

  /**
   * 특정 사용자의 모든 세션을 물리 삭제합니다.
   * 계정 삭제 / 강제 로그아웃 시 사용합니다.
   */
  async deleteByUserId(userId: string): Promise<number> {
    const result = await this.repository.delete({ user_id: userId });
    return result.affected ?? 0;
  }

  /**
   * 만료된 세션을 물리 삭제합니다.
   * 백그라운드 정리 작업(cleanup)에서 호출됩니다.
   */
  async deleteExpiredSessions(): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(UserSession)
      .where('expires_at <= NOW()')
      .execute();

    return result.affected ?? 0;
  }
}
