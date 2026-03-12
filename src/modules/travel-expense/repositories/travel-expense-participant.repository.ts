import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { TravelExpenseParticipant } from '../entities/travel-expense-participant.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';

@Injectable()
export class TravelExpenseParticipantRepository extends BaseRepository<TravelExpenseParticipant> {
  constructor(
    @InjectRepository(TravelExpenseParticipant)
    participantRepository: Repository<TravelExpenseParticipant>
  ) {
    super(participantRepository);
  }

  async findByExpense(expenseId: string): Promise<TravelExpenseParticipant[]> {
    return this.repository.find({
      where: { expenseId },
      relations: ['member'],
      order: { memberId: 'ASC' },
    });
  }

  async findByUser(memberId: string): Promise<TravelExpenseParticipant[]> {
    return this.repository.find({
      where: { memberId },
      relations: ['expense', 'expense.travel'],
      order: { memberId: 'ASC' },
    });
  }

  async addParticipants(expenseId: string, memberIds: string[]): Promise<TravelExpenseParticipant[]> {
    if (memberIds.length === 0) return [];

    const participants = memberIds.map(memberId =>
      this.repository.create({ expenseId, memberId })
    );

    return this.repository.save(participants);
  }

  async removeParticipant(expenseId: string, memberId: string): Promise<boolean> {
    const result = await this.repository.delete({ expenseId, memberId });
    return result.affected !== 0;
  }

  async removeAllParticipants(expenseId: string): Promise<void> {
    await this.repository.delete({ expenseId });
  }

  async replaceParticipants(expenseId: string, memberIds: string[]): Promise<TravelExpenseParticipant[]> {
    let newParticipants: TravelExpenseParticipant[] = [];

    await this.repository.manager.transaction(async (manager) => {
      // Remove existing participants
      await manager.delete(TravelExpenseParticipant, { expenseId });

      // Add new participants
      if (memberIds.length > 0) {
        const participants = memberIds.map(memberId =>
          manager.create(TravelExpenseParticipant, { expenseId, memberId })
        );
        newParticipants = await manager.save(participants);
      }
    });

    // Load relations for the created participants
    return newParticipants.length > 0
      ? await this.repository.find({
          where: { expenseId },
          relations: ['member'],
          order: { memberId: 'ASC' },
        })
      : [];
  }

  async isParticipant(expenseId: string, memberId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { expenseId, memberId },
    });
    return count > 0;
  }

  async getParticipantCount(expenseId: string): Promise<number> {
    return this.repository.count({
      where: { expenseId },
    });
  }

  /**
   * 기존: expenseIds 가 여러 개일 때 WHERE expenseId = single_id 만 조회되는 버그 존재.
   *        (TypeORM In() 연산자를 사용하지 않아 첫 번째 ID 외 나머지가 무시됨)
   * 개선: In() 연산자로 모든 expenseId 를 단일 IN 쿼리로 조회.
   */
  async findExpenseParticipants(expenseIds: string[]): Promise<Map<string, TravelExpenseParticipant[]>> {
    if (expenseIds.length === 0) return new Map();

    // In() 연산자로 다중 expenseId 를 올바르게 처리
    const participants = await this.repository.find({
      where: { expenseId: In(expenseIds) },
      relations: ['member'],
    });

    const participantMap = new Map<string, TravelExpenseParticipant[]>();

    for (const participant of participants) {
      if (!participantMap.has(participant.expenseId)) {
        participantMap.set(participant.expenseId, []);
      }
      participantMap.get(participant.expenseId)!.push(participant);
    }

    return participantMap;
  }

  async bulkRemoveByExpenses(expenseIds: string[]): Promise<void> {
    if (expenseIds.length === 0) return;

    await this.repository.createQueryBuilder()
      .delete()
      .where('expenseId IN (:...expenseIds)', { expenseIds })
      .execute();
  }
}
