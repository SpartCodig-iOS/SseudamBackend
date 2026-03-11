import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { DeviceToken } from '../entities/device-token.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';

@Injectable()
export class DeviceTokenRepository extends BaseRepository<DeviceToken> {
  constructor(
    @InjectRepository(DeviceToken)
    deviceTokenRepository: Repository<DeviceToken>,
  ) {
    super(deviceTokenRepository);
  }

  /**
   * 익명(비로그인) 디바이스 토큰을 Upsert합니다.
   * device_token UNIQUE 제약 기준으로 충돌 시 pending_key와 상태를 갱신합니다.
   */
  async upsertAnonymousToken(pendingKey: string, deviceToken: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .insert()
      .into(DeviceToken)
      .values({
        user_id: undefined,
        pending_key: pendingKey,
        device_token: deviceToken,
        platform: 'ios',
        is_active: true,
        last_used_at: () => 'NOW()',
      })
      .orUpdate(
        ['pending_key', 'is_active', 'last_used_at', 'updated_at'],
        ['device_token'],
      )
      .execute();
  }

  /**
   * pendingKey 또는 deviceToken 기준으로 익명 토큰을 특정 사용자와 연결합니다.
   * 트랜잭션 내에서 실행됩니다:
   *   1. 매칭 토큰에 user_id 설정 & pending_key 초기화
   *   2. 매칭 행이 없고 deviceToken이 있으면 신규 삽입
   *   3. 해당 사용자의 다른 활성 토큰 비활성화
   */
  async bindPendingTokensToUser(
    userId: string,
    pendingKey?: string,
    deviceToken?: string,
    manager?: EntityManager,
  ): Promise<void> {
    const repo = this.getRepoForManager(manager);

    const token = deviceToken?.trim() ?? null;
    const key = pendingKey?.trim() ?? null;

    const run = async (mgr: EntityManager) => {
      const r = mgr.getRepository(DeviceToken);

      // 1. 매칭 토큰 업데이트
      const updateResult = await r
        .createQueryBuilder()
        .update(DeviceToken)
        .set({
          user_id: userId,
          pending_key: undefined,
          is_active: true,
          last_used_at: () => 'NOW()',
          updated_at: () => 'NOW()',
        })
        .where(
          '(:token::text IS NOT NULL AND device_token = :token::text) OR (:key::text IS NOT NULL AND pending_key = :key::text)',
          { token, key },
        )
        .execute();

      // 2. 매칭 없고 deviceToken 존재 시 신규 Upsert
      if ((updateResult.affected ?? 0) === 0 && token) {
        await r
          .createQueryBuilder()
          .insert()
          .into(DeviceToken)
          .values({
            user_id: userId,
            device_token: token,
            platform: 'ios',
            is_active: true,
            last_used_at: () => 'NOW()',
            pending_key: undefined,
          })
          .orUpdate(
            ['user_id', 'is_active', 'last_used_at', 'updated_at', 'pending_key'],
            ['device_token'],
          )
          .execute();
      }

      // 3. 동일 사용자의 다른 활성 토큰 비활성화
      if (token) {
        await r
          .createQueryBuilder()
          .update(DeviceToken)
          .set({
            is_active: false,
            updated_at: () => 'NOW()',
          })
          .where('user_id = :userId', { userId })
          .andWhere('device_token <> :token', { token })
          .andWhere('is_active = true')
          .execute();
      }
    };

    if (manager) {
      await run(manager);
    } else {
      await this.withTransaction(run);
    }
  }

  /**
   * 특정 사용자의 디바이스 토큰을 Upsert합니다.
   * device_token UNIQUE 기준으로 충돌 시 user_id를 덮어씁니다.
   * 트랜잭션 내에서 기존 사용자의 다른 활성 토큰을 비활성화합니다.
   */
  async upsertDeviceToken(
    userId: string,
    deviceToken: string,
    manager?: EntityManager,
  ): Promise<void> {
    const run = async (mgr: EntityManager) => {
      const r = mgr.getRepository(DeviceToken);

      // 1. device_token 기준 Upsert
      await r
        .createQueryBuilder()
        .insert()
        .into(DeviceToken)
        .values({
          user_id: userId,
          device_token: deviceToken,
          platform: 'ios',
          is_active: true,
          last_used_at: () => 'NOW()',
          pending_key: undefined,
        })
        .orUpdate(
          ['user_id', 'is_active', 'last_used_at', 'updated_at', 'pending_key'],
          ['device_token'],
        )
        .execute();

      // 2. 동일 사용자의 다른 활성 토큰 비활성화
      await r
        .createQueryBuilder()
        .update(DeviceToken)
        .set({
          is_active: false,
          updated_at: () => 'NOW()',
        })
        .where('user_id = :userId', { userId })
        .andWhere('device_token <> :deviceToken', { deviceToken })
        .andWhere('is_active = true')
        .execute();
    };

    if (manager) {
      await run(manager);
    } else {
      await this.withTransaction(run);
    }
  }

  /**
   * 특정 사용자의 활성 디바이스 토큰 목록을 반환합니다.
   * last_used_at DESC 정렬로 최신 토큰이 앞에 옵니다.
   */
  async findActiveTokensByUserId(userId: string): Promise<string[]> {
    const rows = await this.repository.find({
      where: { user_id: userId, is_active: true },
      order: { last_used_at: 'DESC' },
      select: ['device_token'],
    });

    return rows.map((r) => r.device_token);
  }

  /**
   * 여러 사용자의 활성 디바이스 토큰을 { userId: string[] } 형태로 반환합니다.
   */
  async findActiveTokensByUserIds(
    userIds: string[],
  ): Promise<Record<string, string[]>> {
    if (userIds.length === 0) return {};

    const rows = await this.repository
      .createQueryBuilder('dt')
      .select(['dt.user_id', 'dt.device_token'])
      .where('dt.user_id = ANY(:userIds)', { userIds })
      .andWhere('dt.is_active = true')
      .orderBy('dt.user_id')
      .addOrderBy('dt.last_used_at', 'DESC')
      .getMany();

    const result: Record<string, string[]> = {};
    for (const row of rows) {
      const uid = row.user_id!;
      if (!result[uid]) result[uid] = [];
      result[uid].push(row.device_token);
    }

    return result;
  }

  /**
   * 특정 토큰을 비활성화합니다 (APNS 오류 응답 처리 시 사용).
   */
  async deactivateToken(deviceToken: string): Promise<void> {
    await this.repository
      .createQueryBuilder()
      .update(DeviceToken)
      .set({
        is_active: false,
        updated_at: () => 'NOW()',
      })
      .where('device_token = :deviceToken', { deviceToken })
      .execute();
  }

  /**
   * 특정 사용자의 모든 활성 토큰을 비활성화합니다 (로그아웃 처리 시 사용).
   */
  async deactivateAllTokensByUserId(userId: string): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .update(DeviceToken)
      .set({
        is_active: false,
        updated_at: () => 'NOW()',
      })
      .where('user_id = :userId', { userId })
      .andWhere('is_active = true')
      .execute();

    return result.affected ?? 0;
  }

  /**
   * 30일 이상 사용되지 않은 비활성 토큰을 물리 삭제합니다.
   * 스케줄러 기반 정리 작업에서 호출됩니다.
   */
  async deleteOldInactiveTokens(): Promise<number> {
    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(DeviceToken)
      .where('is_active = false')
      .andWhere("updated_at < NOW() - INTERVAL '30 days'")
      .execute();

    return result.affected ?? 0;
  }
}
