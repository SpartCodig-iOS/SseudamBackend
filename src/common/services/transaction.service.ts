import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryRunner } from 'typeorm';
import type { IsolationLevel } from 'typeorm/driver/types/IsolationLevel';

// ────────────────────────────────────────────────
// 트랜잭션 옵션 타입
// ────────────────────────────────────────────────

export interface TransactionOptions {
  /** DB 격리 레벨 (기본: READ COMMITTED) */
  isolationLevel?: IsolationLevel;
  /** 데드락 발생 시 최대 재시도 횟수 (기본: 3) */
  maxRetries?: number;
  /** 재시도 기본 대기 시간(ms) (기본: 100) */
  retryDelay?: number;
  /** 트랜잭션 타임아웃(ms). 0 이면 타임아웃 없음 (기본: 0) */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<TransactionOptions> = {
  isolationLevel: 'READ COMMITTED',
  maxRetries: 3,
  retryDelay: 100,
  timeoutMs: 0,
};

// ────────────────────────────────────────────────
// 데드락 / 직렬화 실패 감지
// ────────────────────────────────────────────────

/**
 * PostgreSQL 에러 코드 기준으로 재시도 가능한 트랜잭션 에러인지 판별합니다.
 * - 40001: serialization_failure
 * - 40P01: deadlock_detected
 */
function isRetryableError(error: unknown): boolean {
  const pgCode = (error as any)?.code;
  return pgCode === '40001' || pgCode === '40P01';
}

// ────────────────────────────────────────────────
// TransactionService
// ────────────────────────────────────────────────

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  // ─── 기본 트랜잭션 실행 ──────────────────────

  /**
   * 트랜잭션을 실행합니다.
   * - 데드락 / 직렬화 실패 시 자동 재시도합니다.
   * - 격리 레벨을 명시적으로 설정할 수 있습니다.
   * - 선택적 타임아웃 지원.
   *
   * @example
   * const result = await transactionService.run(async (manager) => {
   *   const expense = await manager.save(TravelExpense, expenseData);
   *   await manager.save(TravelExpenseParticipant, participants);
   *   return expense;
   * }, { isolationLevel: 'REPEATABLE READ', maxRetries: 3 });
   */
  async run<T>(
    callback: (manager: EntityManager) => Promise<T>,
    options: TransactionOptions = {},
  ): Promise<T> {
    const {
      isolationLevel,
      maxRetries,
      retryDelay,
      timeoutMs,
    } = { ...DEFAULT_OPTIONS, ...options };

    let attempt = 0;

    while (true) {
      attempt++;
      const queryRunner = this.dataSource.createQueryRunner();

      try {
        await queryRunner.connect();
        await queryRunner.startTransaction(isolationLevel);

        // 선택적 statement 타임아웃 설정
        if (timeoutMs > 0) {
          await queryRunner.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
        }

        const result = await callback(queryRunner.manager);
        await queryRunner.commitTransaction();
        return result;

      } catch (error) {
        await this._safeRollback(queryRunner);

        // 재시도 가능한 에러(데드락/직렬화 실패)이고 재시도 횟수가 남아있으면 재시도
        if (isRetryableError(error) && attempt <= maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1); // 지수 백오프
          this.logger.warn(
            `[Transaction] Retryable error (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms. code=${(error as any)?.code}`,
          );
          await this._sleep(delay);
          continue;
        }

        // 재시도 불가능하거나 재시도 소진 시 에러 전파
        if (isRetryableError(error) && attempt > maxRetries) {
          this.logger.error(
            `[Transaction] Max retries (${maxRetries}) exceeded. Giving up. code=${(error as any)?.code}`,
          );
          throw new InternalServerErrorException(
            '데이터베이스 충돌이 발생했습니다. 잠시 후 다시 시도해주세요.',
          );
        }

        throw error;

      } finally {
        await queryRunner.release();
      }
    }
  }

  // ─── SERIALIZABLE 트랜잭션 ───────────────────

  /**
   * SERIALIZABLE 격리 레벨로 트랜잭션을 실행합니다.
   * - 정산 계산처럼 강한 일관성이 필요한 작업에 사용합니다.
   * - 직렬화 실패 시 자동 재시도합니다.
   */
  async runSerializable<T>(
    callback: (manager: EntityManager) => Promise<T>,
    maxRetries = 5,
  ): Promise<T> {
    return this.run(callback, {
      isolationLevel: 'SERIALIZABLE',
      maxRetries,
      retryDelay: 150,
    });
  }

  // ─── REPEATABLE READ 트랜잭션 ────────────────

  /**
   * REPEATABLE READ 격리 레벨로 트랜잭션을 실행합니다.
   * - 집계 쿼리 + 데이터 변경이 함께 있는 작업에 적합합니다.
   */
  async runRepeatableRead<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.run(callback, {
      isolationLevel: 'REPEATABLE READ',
      maxRetries: 3,
    });
  }

  // ─── 읽기 전용 트랜잭션 ──────────────────────

  /**
   * READ ONLY 트랜잭션으로 조회 성능을 최적화합니다.
   * - 읽기 전용 복제본(Read Replica) 라우팅 힌트로도 활용 가능합니다.
   * - Lock 획득 없이 일관된 스냅샷을 읽습니다.
   */
  async runReadOnly<T>(
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction('REPEATABLE READ');
      await queryRunner.query('SET TRANSACTION READ ONLY');

      const result = await callback(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;

    } catch (error) {
      await this._safeRollback(queryRunner);
      throw error;

    } finally {
      await queryRunner.release();
    }
  }

  // ─── SAVEPOINT 헬퍼 ──────────────────────────

  /**
   * 중첩 트랜잭션을 SAVEPOINT 로 구현합니다.
   * - 외부 트랜잭션 내에서 부분 롤백이 필요한 경우 사용합니다.
   *
   * @example
   * await transactionService.run(async (manager) => {
   *   await transactionService.withSavepoint(manager, 'sp1', async () => {
   *     // 이 블록이 실패해도 외부 트랜잭션은 유지됩니다.
   *     await risky();
   *   });
   *   await safe();
   * });
   */
  async withSavepoint<T>(
    manager: EntityManager,
    savepointName: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    await manager.query(`SAVEPOINT ${savepointName}`);
    try {
      const result = await callback();
      await manager.query(`RELEASE SAVEPOINT ${savepointName}`);
      return result;
    } catch (error) {
      await manager.query(`ROLLBACK TO SAVEPOINT ${savepointName}`).catch(() => undefined);
      throw error;
    }
  }

  // ─── 배치 트랜잭션 ───────────────────────────

  /**
   * 대량 작업을 청크 단위의 트랜잭션으로 분할 처리합니다.
   * - 단일 트랜잭션에서 너무 많은 데이터를 처리하면 락 경합과 메모리 문제가 발생합니다.
   * - 각 청크가 독립적인 트랜잭션으로 커밋되므로 일부 실패 시 해당 청크만 롤백됩니다.
   *
   * @example
   * const results = await transactionService.runInBatches(
   *   updates,
   *   200,
   *   async (manager, batch) => {
   *     // batch 단위로 처리
   *     return batch.length;
   *   }
   * );
   */
  async runInBatches<TItem, TResult>(
    items: TItem[],
    chunkSize: number,
    callback: (manager: EntityManager, batch: TItem[]) => Promise<TResult>,
    options: TransactionOptions = {},
  ): Promise<TResult[]> {
    const results: TResult[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const batch = items.slice(i, i + chunkSize);
      const result = await this.run(
        (manager) => callback(manager, batch),
        options,
      );
      results.push(result);
    }

    return results;
  }

  // ─── 정산 전용 트랜잭션 ──────────────────────

  /**
   * 정산 계산에 최적화된 트랜잭션.
   * - DELETE + INSERT 패턴을 단일 SERIALIZABLE 트랜잭션으로 래핑합니다.
   * - 동시 요청으로 인한 이중 정산을 방지합니다.
   *
   * @example
   * await transactionService.runSettlementTransaction(travelId, async (manager) => {
   *   await manager.delete(TravelSettlement, { travelId });
   *   await manager.save(TravelSettlement, newSettlements);
   * });
   */
  async runSettlementTransaction<T>(
    travelId: string,
    callback: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.run(
      async (manager) => {
        // 여행 레코드에 FOR UPDATE 락 획득으로 동시 정산 계산 방지
        await manager.query(
          `SELECT id FROM travels WHERE id = $1 FOR UPDATE`,
          [travelId],
        );
        return callback(manager);
      },
      {
        isolationLevel: 'REPEATABLE READ',
        maxRetries: 3,
        retryDelay: 200,
      },
    );
  }

  // ─── 내부 유틸리티 ───────────────────────────

  private async _safeRollback(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.rollbackTransaction();
    } catch (rollbackError) {
      this.logger.error('[Transaction] Rollback failed:', rollbackError);
    }
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
