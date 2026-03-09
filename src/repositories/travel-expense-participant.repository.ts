import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TravelExpenseParticipant } from '../entities/travel-expense-participant.entity';
import { BaseRepository } from './base.repository';

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
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
  }

  async findByUser(userId: string): Promise<TravelExpenseParticipant[]> {
    return this.repository.find({
      where: { userId },
      relations: ['expense', 'expense.travel'],
      order: { createdAt: 'DESC' },
    });
  }

  async addParticipants(expenseId: string, userIds: string[]): Promise<TravelExpenseParticipant[]> {
    if (userIds.length === 0) return [];

    const participants = userIds.map(userId =>
      this.repository.create({ expenseId, userId })
    );

    return this.repository.save(participants);
  }

  async removeParticipant(expenseId: string, userId: string): Promise<boolean> {
    const result = await this.repository.delete({ expenseId, userId });
    return result.affected !== 0;
  }

  async removeAllParticipants(expenseId: string): Promise<void> {
    await this.repository.delete({ expenseId });
  }

  async replaceParticipants(expenseId: string, userIds: string[]): Promise<TravelExpenseParticipant[]> {
    await this.repository.manager.transaction(async (manager) => {
      // Remove existing participants
      await manager.delete(TravelExpenseParticipant, { expenseId });

      // Add new participants
      if (userIds.length > 0) {
        const participants = userIds.map(userId =>
          manager.create(TravelExpenseParticipant, { expenseId, userId })
        );
        await manager.save(participants);
      }
    });

    return this.findByExpense(expenseId);
  }

  async isParticipant(expenseId: string, userId: string): Promise<boolean> {
    const count = await this.repository.count({
      where: { expenseId, userId },
    });
    return count > 0;
  }

  async getParticipantCount(expenseId: string): Promise<number> {
    return this.repository.count({
      where: { expenseId },
    });
  }

  async findExpenseParticipants(expenseIds: string[]): Promise<Map<string, TravelExpenseParticipant[]>> {
    if (expenseIds.length === 0) return new Map();

    const participants = await this.repository.find({
      where: { expenseId: expenseIds.length === 1 ? expenseIds[0] : undefined },
      relations: ['user'],
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