import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Travel, TravelStatus } from '../../domain/entities/travel.entity';
import { ITravelRepository } from '../../domain/repositories/travel.repository.interface';
import { TravelListOptions, TravelStats } from '../../domain/types/travel.types';
import { BaseRepository } from '../../../../shared/infrastructure/repository/base.repository';

@Injectable()
export class TravelRepository extends BaseRepository<Travel> implements ITravelRepository {
  constructor(
    @InjectRepository(Travel)
    travelRepository: Repository<Travel>
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

  async getTravelStats(travelId: string): Promise<TravelStats> {
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
      .andWhere('travel.status = :status', { status: TravelStatus.ACTIVE })
      .orderBy('travel.startDate', 'ASC')
      .getMany();
  }

  async updateStatus(travelId: string, status: TravelStatus): Promise<Travel | null> {
    await this.repository.update(travelId, { status });
    return this.findById(travelId);
  }

  async checkUserAccess(travelId: string, userId: string): Promise<boolean> {
    const count = await this.repository.createQueryBuilder('travel')
      .leftJoin('travel.members', 'members')
      .where('travel.id = :travelId', { travelId })
      .andWhere('(travel.ownerId = :userId OR members.userId = :userId)', { userId })
      .getCount();

    return count > 0;
  }
}