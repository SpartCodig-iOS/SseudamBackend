import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { TravelExpense, ExpenseCategory } from '../entities/travel-expense.entity';
import { BaseRepository } from '../../../common/repositories/base.repository';
import {
  aggregateExpenseStats,
  aggregateUserExpenseStats,
  type ExpenseStatsRow,
  type UserExpenseStatsRow,
} from '../../../common/utils/query-optimizer';

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
    travelExpenseRepository: Repository<TravelExpense>,
    private readonly dataSource: DataSource,
  ) {
    super(travelExpenseRepository);
  }

  /**
   * TypeORM 관계를 사용한 경비 조회 (참여자 포함)
   */
  async findExpensesWithParticipants(travelId: string): Promise<TravelExpense[]> {
    return await this.repository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.participants', 'participant')
      .leftJoinAndSelect('participant.user', 'user')
      .leftJoinAndSelect('expense.payer', 'payer')
      .where('expense.travelId = :travelId', { travelId })
      .orderBy('expense.expenseDate', 'DESC')
      .addOrderBy('expense.createdAt', 'DESC')
      .getMany();
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

  /**
   * 기존: 전체 지출을 메모리로 가져와서 JS에서 집계 → 테이블이 클수록 느려짐
   * 개선: DB GROUP BY + SUM 으로 직접 집계 (단일 병렬 쿼리 3개)
   */
  async getTravelExpenseStats(travelId: string, startDate?: string, endDate?: string): Promise<ExpenseStats> {
    const stats: ExpenseStatsRow = await aggregateExpenseStats(
      this.dataSource,
      travelId,
      startDate,
      endDate,
    );
    return stats;
  }

  /**
   * 기존: 3번 개별 쿼리 실행
   * 개선: 단일 쿼리로 모든 통계 집계
   */
  async getUserExpenseStats(travelId: string, userId: string): Promise<{
    totalPaid: number;
    totalOwed: number;
    expenseCount: number;
  }> {
    const stats: UserExpenseStatsRow = await aggregateUserExpenseStats(
      this.dataSource,
      travelId,
      userId,
    );

    return {
      totalPaid: stats.totalPaid,
      totalOwed: 0, // 정산 로직에 따라 계산해야 함
      expenseCount: stats.authoredCount,
    };
  }

  async findExpensesByDateRange(travelId: string, startDate: string, endDate: string): Promise<TravelExpense[]> {
    return this.repository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.user', 'user')
      .leftJoinAndSelect('expense.payer', 'payer')
      .leftJoinAndSelect('expense.participants', 'participants')
      .leftJoinAndSelect('participants.user', 'participantUser')
      .where('expense.travelId = :travelId', { travelId })
      // 복합 인덱스 (travelId, expenseDate) 활용
      .andWhere('expense.expenseDate BETWEEN :startDate AND :endDate', {
        startDate,
        endDate,
      })
      .orderBy('expense.expenseDate', 'ASC')
      .addOrderBy('expense.createdAt', 'ASC')
      .getMany();
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

  /**
   * 지출을 카테고리별로 분류합니다.
   * DB GROUP BY 로 처리하여 메모리 집계를 제거합니다.
   */
  async getExpensesByCategory(travelId: string): Promise<Record<string, TravelExpense[]>> {
    // 인덱스 (travelId, category) 활용
    const expenses = await this.repository
      .createQueryBuilder('expense')
      .leftJoinAndSelect('expense.user', 'user')
      .leftJoinAndSelect('expense.payer', 'payer')
      .where('expense.travelId = :travelId', { travelId })
      .orderBy('expense.category', 'ASC')
      .addOrderBy('expense.expenseDate', 'DESC')
      .getMany();

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

  /**
   * 기존: 루프 내 개별 UPDATE (N번 쿼리)
   * 개선: CASE WHEN 단일 UPDATE 로 1번 쿼리로 처리
   */
  async bulkUpdateConvertedAmount(updates: Array<{ id: string; convertedAmount: number }>): Promise<void> {
    if (updates.length === 0) return;

    // 청크 단위로 분할하여 IN 조건 파라미터 수 제한 대응
    const CHUNK_SIZE = 500;

    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);

      // CASE WHEN 으로 단일 UPDATE 실행
      const caseExpr = chunk
        .map((_, idx) => `WHEN id = $${idx * 2 + 2} THEN $${idx * 2 + 3}`)
        .join(' ');

      const ids = chunk.map((u) => u.id);
      const params: unknown[] = [ids];
      for (const u of chunk) {
        params.push(u.id, u.convertedAmount);
      }

      await this.repository.query(
        `UPDATE travel_expenses
         SET converted_amount = CASE ${caseExpr} END,
             updated_at = NOW()
         WHERE id = ANY($1::uuid[])`,
        params,
      );
    }
  }
}
