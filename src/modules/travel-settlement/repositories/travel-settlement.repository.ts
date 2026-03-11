import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { TravelSettlement, SettlementStatus } from '../entities/travel-settlement.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';

@Injectable()
export class TravelSettlementRepository extends BaseRepository<TravelSettlement> {
  constructor(
    @InjectRepository(TravelSettlement)
    settlementRepository: Repository<TravelSettlement>,
  ) {
    super(settlementRepository);
  }

  async findByTravel(travelId: string): Promise<TravelSettlement[]> {
    return this.repository.find({
      where: { travelId },
      order: { createdAt: 'ASC' },
    });
  }

  async findByTravelWithProfiles(travelId: string): Promise<TravelSettlement[]> {
    return this.repository
      .createQueryBuilder('ts')
      .leftJoinAndSelect('ts.fromUser', 'fromUser')
      .leftJoinAndSelect('ts.toUser', 'toUser')
      .where('ts.travelId = :travelId', { travelId })
      .orderBy('ts.createdAt', 'ASC')
      .getMany();
  }

  async deleteByTravel(travelId: string, manager?: EntityManager): Promise<void> {
    const repo = manager ? manager.getRepository(TravelSettlement) : this.repository;
    await repo.delete({ travelId });
  }

  async bulkInsertSettlements(
    settlements: Array<{
      id: string;
      travelId: string;
      fromMember: string;
      toMember: string;
      amount: number;
    }>,
    manager?: EntityManager,
  ): Promise<void> {
    if (settlements.length === 0) return;
    const repo = manager ? manager.getRepository(TravelSettlement) : this.repository;
    const entities = settlements.map((s) =>
      repo.create({
        id: s.id,
        travelId: s.travelId,
        fromMember: s.fromMember,
        toMember: s.toMember,
        amount: s.amount,
        status: SettlementStatus.PENDING,
      }),
    );
    await repo.save(entities);
  }

  async markCompleted(settlementId: string, travelId: string): Promise<TravelSettlement | null> {
    const result = await this.repository
      .createQueryBuilder()
      .update(TravelSettlement)
      .set({
        status: SettlementStatus.COMPLETED,
        completedAt: () => 'NOW()',
        updatedAt: () => 'NOW()',
      })
      .where('id = :settlementId AND travelId = :travelId', { settlementId, travelId })
      .returning('id')
      .execute();

    if (!result.affected || result.affected === 0) {
      return null;
    }
    return this.findById(settlementId);
  }

  async isMember(travelId: string, userId: string): Promise<boolean> {
    const count = await this.repository.manager
      .createQueryBuilder()
      .select('1')
      .from('travel_members', 'tm')
      .where('tm.travel_id = :travelId AND tm.user_id = :userId', { travelId, userId })
      .limit(1)
      .getCount();
    return count > 0;
  }
}
