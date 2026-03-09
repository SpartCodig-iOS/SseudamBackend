import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { TravelExpense, ExpenseCategory } from '../entities/travel-expense.entity';
import { BaseRepository } from './base.repository';

export interface ExpenseListOptions {
  travelId?: string;
  authorId?: string;
  payerId?: string;
  category?: ExpenseCategory;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: 'expense_date' | 'amount' | 'created_at';
  sortOrder?: 'ASC' | 'DESC';
}

export interface ExpenseStats {
  totalAmount: number;
  totalConverted: number;
  expenseCount: number;
  categoryBreakdown: Record<string, number>;
  currencyBreakdown: Record<string, number>;
}

@Injectable()
export class TravelExpenseRepository extends BaseRepository<TravelExpense> {
  constructor(
    @InjectRepository(TravelExpense)
    travelExpenseRepository: Repository<TravelExpense>
  ) {
    super(travelExpenseRepository);
  }

  async findExpensesByTravel(travelId: string, options: ExpenseListOptions = {}): Promise<[TravelExpense[], number]> {
    const {
      authorId,
      payerId,
      category,
      startDate,
      endDate,
      page = 1,
      limit = 20,
      sortBy = 'expense_date',
      sortOrder = 'DESC',
    } = options;

    const queryBuilder = this.repository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.user', 'author')
      .leftJoinAndSelect('expense.payer', 'payer')
      .leftJoinAndSelect('expense.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .where('expense.travelId = :travelId', { travelId });

    if (authorId) {
      queryBuilder.andWhere('expense.authorId = :authorId', { authorId });
    }

    if (payerId) {
      queryBuilder.andWhere('expense.payerId = :payerId', { payerId });
    }

    if (category) {
      queryBuilder.andWhere('expense.category = :category', { category });
    }

    if (startDate && endDate) {
      queryBuilder.andWhere('expense.expenseDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    } else if (startDate) {
      queryBuilder.andWhere('expense.expenseDate >= :startDate', { startDate });
    } else if (endDate) {
      queryBuilder.andWhere('expense.expenseDate <= :endDate', { endDate });
    }

    queryBuilder
      .orderBy(`expense.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    return queryBuilder.getManyAndCount();
  }

  async findExpenseWithDetails(expenseId: string): Promise<TravelExpense | null> {
    return this.repository.findOne({
      where: { id: expenseId },
      relations: [
        'travel',
        'user',
        'payer',
        'participants',
        'participants.user',
      ],
    });
  }

  async getTravelExpenseStats(travelId: string, startDate?: string, endDate?: string): Promise<ExpenseStats> {
    let queryBuilder = this.repository.createQueryBuilder('expense')
      .where('expense.travelId = :travelId', { travelId });

    if (startDate && endDate) {
      queryBuilder = queryBuilder.andWhere('expense.expenseDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      });
    }

    const expenses = await queryBuilder.getMany();

    const totalAmount = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
    const totalConverted = expenses.reduce((sum, expense) => sum + Number(expense.convertedAmount), 0);
    const expenseCount = expenses.length;

    const categoryBreakdown = expenses.reduce((acc, expense) => {
      const category = expense.category || 'other';
      acc[category] = (acc[category] || 0) + Number(expense.convertedAmount);
      return acc;
    }, {} as Record<string, number>);

    const currencyBreakdown = expenses.reduce((acc, expense) => {
      acc[expense.currency] = (acc[expense.currency] || 0) + Number(expense.amount);
      return acc;
    }, {} as Record<string, number>);

    return {
      totalAmount,
      totalConverted,
      expenseCount,
      categoryBreakdown,
      currencyBreakdown,
    };
  }

  async getUserExpenseStats(travelId: string, userId: string): Promise<{
    totalPaid: number;
    totalOwed: number;
    expenseCount: number;
  }> {
    // 사용자가 지불한 총 금액
    const paidResult = await this.repository.createQueryBuilder('expense')
      .select('COALESCE(SUM(expense.convertedAmount), 0)', 'total')
      .where('expense.travelId = :travelId', { travelId })
      .andWhere('expense.payerId = :userId', { userId })
      .getRawOne();

    // 사용자가 참여한 지출의 총 개수
    const participatedResult = await this.repository.createQueryBuilder('expense')
      .leftJoin('expense.participants', 'participant')
      .select('COUNT(DISTINCT expense.id)', 'count')
      .where('expense.travelId = :travelId', { travelId })
      .andWhere('participant.userId = :userId', { userId })
      .getRawOne();

    // 사용자가 작성한 지출 개수
    const authoredResult = await this.repository.createQueryBuilder('expense')
      .select('COUNT(*)', 'count')
      .where('expense.travelId = :travelId', { travelId })
      .andWhere('expense.authorId = :userId', { userId })
      .getRawOne();

    return {
      totalPaid: parseFloat(paidResult.total) || 0,
      totalOwed: 0, // 정산 로직에 따라 계산해야 함
      expenseCount: parseInt(authoredResult.count) || 0,
    };
  }

  async findExpensesByDateRange(travelId: string, startDate: string, endDate: string): Promise<TravelExpense[]> {
    return this.repository.find({
      where: {
        travelId,
        expenseDate: Between(startDate, endDate),
      },
      relations: ['user', 'payer', 'participants', 'participants.user'],
      order: { expenseDate: 'ASC', createdAt: 'ASC' },
    });
  }

  async findUserExpenses(userId: string, options: ExpenseListOptions = {}): Promise<[TravelExpense[], number]> {
    const {
      travelId,
      page = 1,
      limit = 20,
      sortBy = 'expense_date',
      sortOrder = 'DESC',
    } = options;

    const queryBuilder = this.repository.createQueryBuilder('expense')
      .leftJoinAndSelect('expense.travel', 'travel')
      .leftJoinAndSelect('expense.payer', 'payer')
      .leftJoinAndSelect('expense.participants', 'participants')
      .where('expense.authorId = :userId', { userId });

    if (travelId) {
      queryBuilder.andWhere('expense.travelId = :travelId', { travelId });
    }

    queryBuilder
      .orderBy(`expense.${sortBy}`, sortOrder)
      .skip((page - 1) * limit)
      .take(limit);

    return queryBuilder.getManyAndCount();
  }

  async getExpensesByCategory(travelId: string): Promise<Record<string, TravelExpense[]>> {
    const expenses = await this.repository.find({
      where: { travelId },
      relations: ['user', 'payer'],
      order: { expenseDate: 'DESC' },
    });

    return expenses.reduce((acc, expense) => {
      const category = expense.category || 'other';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(expense);
      return acc;
    }, {} as Record<string, TravelExpense[]>);
  }

  async deleteExpensesByTravel(travelId: string): Promise<void> {
    await this.repository.delete({ travelId });
  }

  async bulkUpdateConvertedAmount(updates: Array<{ id: string; convertedAmount: number }>): Promise<void> {
    if (updates.length === 0) return;

    await this.repository.manager.transaction(async (manager) => {
      for (const update of updates) {
        await manager.update(TravelExpense, update.id, {
          convertedAmount: update.convertedAmount,
        });
      }
    });
  }
}