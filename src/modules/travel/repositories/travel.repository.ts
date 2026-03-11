import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Travel, TravelStatus } from '../entities/travel.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  aggregateTravelListStats,
  type TravelListAggregateRow,
} from '../../../common/utils/query-optimizer';

export interface TravelListOptions {
  userId?: string;
  status?: TravelStatus;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: 'created_at' | 'start_date' | 'end_date' | 'title';
  sortOrder?: 'ASC' | 'DESC';
}

export interface TravelWithMembers extends Travel {
  memberCount: number;
  totalExpenses: number;
  totalBudget: number;
}

@Injectable()
export class TravelRepository extends BaseRepository<Travel> {
  constructor(
    @InjectRepository(Travel)
    travelRepository: Repository<Travel>,
    private readonly dataSource: DataSource,
  ) {
    super(travelRepository);
  }

  async findByInviteCode(inviteCode: string): Promise<Travel | null> {
    return this.repository.findOne({
      where: { inviteCode },
      relations: ['user', 'members', 'members.user'],
    });
  }

  async findTravelsByUser(userId: string, options: TravelListOptions = {}): Promise<[Travel[], number]> {
    const {
      status,
      page = 1,
      limit = 20,
      search,
      sortBy = 'created_at',
      sortOrder = 'DESC',
    } = options;

    const queryBuilder = this.repository.createQueryBuilder('travel')
      .leftJoinAndSelect('travel.user', 'owner')
      .leftJoinAndSelect('travel.members', 'members')
      .leftJoinAndSelect('members.user', 'memberUser')
      .where('(travel.ownerId = :userId OR members.userId = :userId)', { userId });

    if (status) {
      // 복합 인덱스 (ownerId, status) 활용
      queryBuilder.andWhere('travel.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        '(travel.title ILIKE :search OR travel.countryNameKr ILIKE :search)',
        { search: `%${search}%` }
      );
    }

    queryBuilder
      .orderBy(`travel.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    return queryBuilder.getManyAndCount();
  }

  /**
   * 여행 목록에 멤버 수 + 총 지출을 포함해 조회합니다.
   * 기존의 여행별 getTravelStats() N+1 호출을 단일 집계 쿼리로 대체합니다.
   */
  async findTravelsByUserWithStats(
    userId: string,
    options: TravelListOptions = {},
  ): Promise<[TravelWithMembers[], number]> {
    const [travels, total] = await this.findTravelsByUser(userId, options);

    if (travels.length === 0) {
      return [[], 0];
    }

    const travelIds = travels.map((t) => t.id);
    const statsMap: Map<string, TravelListAggregateRow> = await aggregateTravelListStats(
      this.dataSource,
      travelIds,
    );

    const travelsWithStats: TravelWithMembers[] = travels.map((travel) => {
      const stats = statsMap.get(travel.id);
      return Object.assign(travel, {
        memberCount: stats?.memberCount ?? 0,
        totalExpenses: stats?.totalExpenses ?? 0,
        totalBudget: travel.budget ?? 0,
      }) as TravelWithMembers;
    });

    return [travelsWithStats, total];
  }

  async findTravelWithDetails(travelId: string, userId?: string): Promise<Travel | null> {
    const queryBuilder = this.repository.createQueryBuilder('travel')
      .leftJoinAndSelect('travel.user', 'owner')
      .leftJoinAndSelect('travel.members', 'members')
      .leftJoinAndSelect('members.user', 'memberUser')
      .leftJoinAndSelect('travel.expenses', 'expenses')
      .leftJoinAndSelect('expenses.user', 'expenseAuthor')
      .leftJoinAndSelect('expenses.payer', 'expensePayer')
      .leftJoinAndSelect('expenses.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .where('travel.id = :travelId', { travelId });

    if (userId) {
      queryBuilder.andWhere(
        '(travel.ownerId = :userId OR members.userId = :userId)',
        { userId }
      );
    }

    return queryBuilder.getOne();
  }

  async generateUniqueInviteCode(): Promise<string> {
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = Math.random().toString(36).substring(2, 10); // 8자리 랜덤 코드
      attempts++;

      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique invite code');
      }
    } while (await this.exists({ inviteCode: code }));

    return code;
  }

  /**
   * 여행 통계 조회.
   * DB 집계 쿼리 방식 유지 (이미 최적화됨).
   */
  async getTravelStats(travelId: string): Promise<{
    totalExpenses: number;
    expenseCount: number;
    memberCount: number;
  }> {
    const result = await this.repository.createQueryBuilder('travel')
      .leftJoin('travel.expenses', 'expense')
      .leftJoin('travel.members', 'member')
      .select('COALESCE(SUM(expense.convertedAmount), 0)', 'totalExpenses')
      .addSelect('COUNT(DISTINCT expense.id)', 'expenseCount')
      .addSelect('COUNT(DISTINCT member.id)', 'memberCount')
      .where('travel.id = :travelId', { travelId })
      .getRawOne();

    return {
      totalExpenses: parseFloat(result.totalExpenses) || 0,
      expenseCount: parseInt(result.expenseCount) || 0,
      memberCount: parseInt(result.memberCount) || 0,
    };
  }

  async findUpcomingTravels(userId: string, days: number = 7): Promise<Travel[]> {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);

    return this.repository.createQueryBuilder('travel')
      .leftJoinAndSelect('travel.members', 'members')
      .where('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
      .andWhere('travel.startDate >= CURRENT_DATE')
      .andWhere('travel.startDate <= :futureDate', {
        futureDate: futureDate.toISOString().split('T')[0]
      })
      // 복합 인덱스 (status, startDate) 활용
      .andWhere('travel.status IN (:...statuses)', {
        statuses: [TravelStatus.PLANNING, TravelStatus.ACTIVE]
      })
      .orderBy('travel.startDate', 'ASC')
      .getMany();
  }

  async findActiveTravels(userId: string): Promise<Travel[]> {
    const today = new Date().toISOString().split('T')[0];

    return this.repository.createQueryBuilder('travel')
      .leftJoinAndSelect('travel.members', 'members')
      .where('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
      .andWhere('travel.startDate <= :today', { today })
      .andWhere('travel.endDate >= :today', { today })
      // 복합 인덱스 (status, startDate) 활용
      .andWhere('travel.status = :status', { status: TravelStatus.ACTIVE })
      .orderBy('travel.startDate', 'ASC')
      .getMany();
  }

  /**
   * 반환값 불필요 시 updateOnly() 를 사용해 불필요한 SELECT 제거.
   * 반환값이 필요한 경우 update() 사용 (SELECT 추가 실행).
   */
  async updateStatus(travelId: string, status: TravelStatus): Promise<Travel | null> {
    return this.update(travelId, { status });
  }

  /**
   * 상태만 변경하고 반환값이 필요 없는 경우 (성능 최적화).
   */
  async updateStatusOnly(travelId: string, status: TravelStatus): Promise<boolean> {
    return this.updateOnly(travelId, { status });
  }

  async checkUserAccess(travelId: string, userId: string): Promise<boolean> {
    const count = await this.repository.createQueryBuilder('travel')
      .leftJoin('travel.members', 'members')
      .where('travel.id = :travelId', { travelId })
      // 복합 인덱스 (ownerId) + members 인덱스 (travelId, userId) 활용
      .andWhere('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
      .getCount();

    return count > 0;
  }
}
