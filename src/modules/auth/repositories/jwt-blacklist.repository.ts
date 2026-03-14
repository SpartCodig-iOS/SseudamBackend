import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { JwtBlacklist, BlacklistReason } from '../entities/jwt-blacklist.entity';

export interface CreateBlacklistEntryDto {
  tokenId: string;
  userId: string;
  expiresAt: Date;
  reason?: BlacklistReason;
  userAgent?: string;
  ipAddress?: string;
}

export interface BlacklistStats {
  totalBlacklisted: number;
  recentBlacklisted: number; // 최근 1시간
  topReasons: Record<string, number>;
}

@Injectable()
export class JwtBlacklistRepository {
  constructor(
    @InjectRepository(JwtBlacklist)
    private readonly repository: Repository<JwtBlacklist>
  ) {}

  /**
   * 토큰을 블랙리스트에 추가
   */
  async addToBlacklist(data: CreateBlacklistEntryDto): Promise<JwtBlacklist> {
    const blacklistEntry = this.repository.create(data);
    return this.repository.save(blacklistEntry);
  }

  /**
   * 토큰이 블랙리스트에 있는지 확인
   */
  async isBlacklisted(tokenId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: {
        tokenId,
        expiresAt: LessThan(new Date()), // 아직 만료되지 않은 토큰만
      },
    });
    return count > 0;
  }

  /**
   * 블랙리스트 항목 조회
   */
  async findByTokenId(tokenId: string): Promise<JwtBlacklist | null> {
    return this.repository.findOne({
      where: { tokenId }
    });
  }

  /**
   * 사용자의 모든 토큰 블랙리스트 처리
   */
  async blacklistAllUserTokens(
    userId: string,
    reason: BlacklistReason = 'security',
    userAgent?: string,
    ipAddress?: string
  ): Promise<number> {
    // 현재 시간 이후에 만료되는 해당 사용자의 토큰들을 찾기
    const existingTokens = await this.repository.find({
      where: {
        userId,
        expiresAt: LessThan(new Date()),
      },
    });

    if (existingTokens.length === 0) {
      return 0;
    }

    // 모든 토큰을 블랙리스트로 업데이트
    await this.repository.update(
      {
        userId,
        expiresAt: LessThan(new Date()),
      },
      {
        reason,
        userAgent,
        ipAddress,
      }
    );

    return existingTokens.length;
  }

  /**
   * 사용자의 블랙리스트된 토큰 목록 조회
   */
  async findUserTokens(userId: string): Promise<JwtBlacklist[]> {
    return this.repository.find({
      where: {
        userId,
        expiresAt: LessThan(new Date()),
      },
      order: { blacklistedAt: 'DESC' },
    });
  }

  /**
   * 블랙리스트 통계 조회
   */
  async getBlacklistStats(): Promise<BlacklistStats> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const [totalBlacklisted, recentBlacklisted, reasonStats] = await Promise.all([
      // 총 블랙리스트 개수
      this.repository.count({
        where: { expiresAt: LessThan(new Date()) }
      }),

      // 최근 1시간 블랙리스트 개수
      this.repository.count({
        where: {
          blacklistedAt: LessThan(oneHourAgo),
          expiresAt: LessThan(new Date()),
        }
      }),

      // 이유별 통계
      this.repository
        .createQueryBuilder('blacklist')
        .select('blacklist.reason', 'reason')
        .addSelect('COUNT(*)', 'count')
        .where('blacklist.expiresAt > :now', { now: new Date() })
        .groupBy('blacklist.reason')
        .getRawMany()
    ]);

    const topReasons: Record<string, number> = {};
    reasonStats.forEach(stat => {
      topReasons[stat.reason] = parseInt(stat.count);
    });

    return {
      totalBlacklisted,
      recentBlacklisted,
      topReasons,
    };
  }

  /**
   * 만료된 블랙리스트 항목 정리
   */
  async cleanupExpiredEntries(): Promise<number> {
    const result = await this.repository.delete({
      expiresAt: LessThan(new Date()),
    });

    return result.affected || 0;
  }

  /**
   * 특정 사용자의 만료된 토큰들만 정리
   */
  async cleanupUserExpiredTokens(userId: string): Promise<number> {
    const result = await this.repository.delete({
      userId,
      expiresAt: LessThan(new Date()),
    });

    return result.affected || 0;
  }

  /**
   * 블랙리스트에서 특정 토큰 제거 (관리자용)
   */
  async removeFromBlacklist(tokenId: string): Promise<boolean> {
    const result = await this.repository.delete({ tokenId });
    return (result.affected || 0) > 0;
  }

  /**
   * 배치로 토큰 블랙리스트 처리
   */
  async blacklistTokensBatch(
    tokenData: CreateBlacklistEntryDto[]
  ): Promise<JwtBlacklist[]> {
    const entities = this.repository.create(tokenData);
    return this.repository.save(entities);
  }
}