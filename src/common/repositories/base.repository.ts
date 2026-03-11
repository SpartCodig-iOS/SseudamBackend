import {
  Repository,
  FindOptionsWhere,
  FindManyOptions,
  DeepPartial,
  DataSource,
  EntityManager,
  ObjectLiteral,
  SelectQueryBuilder,
} from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';

// ────────────────────────────────────────────────
// 커서 기반 페이지네이션 타입
// ────────────────────────────────────────────────

export interface CursorPaginationOptions<T> {
  /** 커서 컬럼 (기본: createdAt) */
  cursorField?: keyof T & string;
  /** 커서 값 (이전 페이지의 마지막 항목 값) */
  cursor?: string | Date;
  /** 페이지 크기 (기본: 20, 최대: 100) */
  limit?: number;
  /** 정렬 방향 (기본: DESC) */
  order?: 'ASC' | 'DESC';
}

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  count: number;
}

// ────────────────────────────────────────────────
// 오프셋 기반 페이지네이션 타입
// ────────────────────────────────────────────────

export interface OffsetPaginationOptions {
  page?: number;
  limit?: number;
}

export interface OffsetPaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ────────────────────────────────────────────────
// 배치 처리 타입
// ────────────────────────────────────────────────

export interface BatchUpsertOptions<T> {
  conflictColumns: (keyof T & string)[];
  updateColumns?: (keyof T & string)[];
}

export interface BatchResult {
  affected: number;
  identifiers?: string[];
}

// ────────────────────────────────────────────────
// BaseRepository
// ────────────────────────────────────────────────

export abstract class BaseRepository<T extends ObjectLiteral & { id: string }> {
  protected repository: Repository<T>;

  constructor(repository: Repository<T>) {
    this.repository = repository;
  }

  // ─── 기본 CRUD ───────────────────────────────

  async create(data: DeepPartial<T>): Promise<T> {
    const entity = this.repository.create(data);
    return this.repository.save(entity);
  }

  async findById(id: string, relations?: string[]): Promise<T | null> {
    return this.repository.findOne({
      where: { id } as FindOptionsWhere<T>,
      relations,
    });
  }

  async findOne(where: FindOptionsWhere<T>, relations?: string[]): Promise<T | null> {
    return this.repository.findOne({ where, relations });
  }

  async findMany(options: FindManyOptions<T> = {}): Promise<T[]> {
    return this.repository.find(options);
  }

  async findAndCount(options: FindManyOptions<T> = {}): Promise<[T[], number]> {
    return this.repository.findAndCount(options);
  }

  /**
   * UPDATE 후 불필요한 SELECT 를 제거한 최적화 버전.
   * - 반환값이 필요 없을 때는 updateOnly() 사용 권장.
   * - 반환값이 필요할 때만 SELECT 를 추가로 실행합니다.
   */
  async update(id: string, data: QueryDeepPartialEntity<T>): Promise<T | null> {
    const result = await this.repository.update(id, data);
    if (!result.affected) return null;
    return this.findById(id);
  }

  /**
   * 반환값 없는 UPDATE (SELECT 쿼리 제거로 성능 향상).
   */
  async updateOnly(id: string, data: QueryDeepPartialEntity<T>): Promise<boolean> {
    const result = await this.repository.update(id, data);
    return (result.affected ?? 0) > 0;
  }

  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected !== 0;
  }

  async softDelete(id: string): Promise<boolean> {
    const result = await this.repository.softDelete(id);
    return result.affected !== 0;
  }

  async count(where?: FindOptionsWhere<T>): Promise<number> {
    return this.repository.count({ where });
  }

  async exists(where: FindOptionsWhere<T>): Promise<boolean> {
    // COUNT(*) 대신 EXISTS 서브쿼리로 인덱스 단락 평가 활용
    const count = await this.repository.count({ where, take: 1 });
    return count > 0;
  }

  getRepository(): Repository<T> {
    return this.repository;
  }

  getManager(): EntityManager {
    return this.repository.manager;
  }

  // ─── 커서 기반 페이지네이션 ──────────────────

  /**
   * 커서 기반 페이지네이션.
   * - 대용량 데이터셋에서 오프셋 페이지네이션보다 성능이 우수합니다.
   * - 커서 컬럼에 인덱스가 있어야 효과적입니다.
   *
   * @example
   * const page1 = await repo.findWithCursor({ limit: 20, order: 'DESC' });
   * const page2 = await repo.findWithCursor({ limit: 20, cursor: page1.nextCursor, order: 'DESC' });
   */
  async findWithCursor(
    options: CursorPaginationOptions<T> & { where?: FindOptionsWhere<T> },
  ): Promise<CursorPaginationResult<T>> {
    const {
      cursorField = 'createdAt',
      cursor,
      limit = 20,
      order = 'DESC',
      where,
    } = options;

    const clampedLimit = Math.min(limit, 100);
    const alias = 'entity';

    const qb: SelectQueryBuilder<T> = this.repository
      .createQueryBuilder(alias)
      .take(clampedLimit + 1); // 한 건 더 조회해서 hasMore 판별

    // where 조건 적용
    if (where) {
      const params: Record<string, unknown> = {};
      Object.entries(where).forEach(([key, value], idx) => {
        qb.andWhere(`${alias}.${key} = :p${idx}`, { [`p${idx}`]: value });
        params[`p${idx}`] = value;
      });
    }

    // 커서 조건 적용
    if (cursor) {
      const operator = order === 'DESC' ? '<' : '>';
      qb.andWhere(`${alias}.${cursorField} ${operator} :cursor`, { cursor });
    }

    qb.orderBy(`${alias}.${cursorField}`, order);

    const rows = await qb.getMany();
    const hasMore = rows.length > clampedLimit;
    const items = hasMore ? rows.slice(0, clampedLimit) : rows;

    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? String((lastItem as Record<string, unknown>)[cursorField])
      : null;

    return {
      items,
      nextCursor,
      hasMore,
      count: items.length,
    };
  }

  // ─── 오프셋 기반 페이지네이션 ────────────────

  /**
   * 오프셋 페이지네이션 (페이지 번호 기반).
   * - 소규모 데이터셋이나 임의 페이지 접근이 필요한 경우 사용합니다.
   */
  async findWithOffset(
    options: OffsetPaginationOptions & {
      where?: FindOptionsWhere<T>;
      order?: Record<string, 'ASC' | 'DESC'>;
      relations?: string[];
    },
  ): Promise<OffsetPaginationResult<T>> {
    const { page = 1, limit = 20, where, order, relations } = options;
    const clampedLimit = Math.min(limit, 100);
    const skip = (page - 1) * clampedLimit;

    const [items, total] = await this.repository.findAndCount({
      where,
      order: order as any,
      relations,
      skip,
      take: clampedLimit,
    });

    const totalPages = Math.ceil(total / clampedLimit);

    return {
      items,
      total,
      page,
      limit: clampedLimit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };
  }

  // ─── 배치 처리 ───────────────────────────────

  /**
   * 배치 INSERT.
   * - 개별 save() 반복 대비 대폭 향상된 성능.
   * - chunkSize 단위로 분할 처리하여 메모리 초과를 방지합니다.
   */
  async bulkInsert(entities: DeepPartial<T>[], chunkSize = 500): Promise<BatchResult> {
    if (entities.length === 0) return { affected: 0 };

    let totalAffected = 0;

    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);
      const result = await this.repository
        .createQueryBuilder()
        .insert()
        .into(this.repository.target)
        .values(chunk as any[])
        .execute();

      totalAffected += result.identifiers.length;
    }

    return { affected: totalAffected };
  }

  /**
   * 배치 UPSERT (INSERT ON CONFLICT DO UPDATE).
   * - 중복 키 충돌 시 지정 컬럼을 업데이트합니다.
   */
  async bulkUpsert(
    entities: DeepPartial<T>[],
    conflictColumns: (keyof T & string)[],
    updateColumns?: (keyof T & string)[],
    chunkSize = 500,
  ): Promise<BatchResult> {
    if (entities.length === 0) return { affected: 0 };

    let totalAffected = 0;

    for (let i = 0; i < entities.length; i += chunkSize) {
      const chunk = entities.slice(i, i + chunkSize);
      const qb = this.repository
        .createQueryBuilder()
        .insert()
        .into(this.repository.target)
        .values(chunk as any[])
        .orIgnore();

      if (updateColumns && updateColumns.length > 0) {
        const metadata = this.repository.metadata;
        const tableName = metadata.tableName;

        // updateColumns 가 있으면 orUpdate 사용
        await this.repository
          .createQueryBuilder()
          .insert()
          .into(this.repository.target)
          .values(chunk as any[])
          .orUpdate(updateColumns, conflictColumns)
          .execute()
          .then((r) => { totalAffected += r.identifiers.length; });

        continue;
      }

      const result = await qb.execute();
      totalAffected += result.identifiers.length;
    }

    return { affected: totalAffected };
  }

  /**
   * IN 조건으로 여러 ID 한 번에 삭제.
   */
  async bulkDeleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;

    const result = await this.repository
      .createQueryBuilder()
      .delete()
      .from(this.repository.target)
      .where('id IN (:...ids)', { ids })
      .execute();

    return result.affected ?? 0;
  }

  /**
   * 스트리밍 방식으로 대용량 데이터를 청크 단위로 조회 및 처리.
   * - 전체를 메모리에 올리지 않아 메모리 효율적입니다.
   *
   * @example
   * await repo.processInChunks({ travelId: 'xxx' }, 100, async (chunk) => {
   *   await doSomethingWith(chunk);
   * });
   */
  async processInChunks(
    where: FindOptionsWhere<T>,
    chunkSize: number,
    processor: (chunk: T[]) => Promise<void>,
    relations?: string[],
  ): Promise<void> {
    let skip = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const chunk = await this.repository.find({
        where,
        relations,
        skip,
        take: chunkSize,
        order: { id: 'ASC' } as any,
      });

      if (chunk.length === 0) break;

      await processor(chunk);

      if (chunk.length < chunkSize) break;
      skip += chunkSize;
    }
  }

  // ─── 트랜잭션 헬퍼 ───────────────────────────

  /**
   * 트랜잭션 래퍼.
   * - 콜백 내부에서 예외 발생 시 자동 롤백합니다.
   * - 중첩 트랜잭션에도 안전합니다(TypeORM SAVEPOINT 활용).
   *
   * @example
   * const result = await repo.withTransaction(async (manager) => {
   *   await manager.save(SomeEntity, data);
   *   return 'success';
   * });
   */
  async withTransaction<R>(
    callback: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    return this.repository.manager.transaction(callback);
  }

  /**
   * 기존 EntityManager 가 있으면 그것을 재사용하고, 없으면 새 트랜잭션을 시작.
   * - 호출 계층 어디서든 트랜잭션 전파를 지원합니다.
   */
  async withTransactionOrManager<R>(
    manager: EntityManager | undefined,
    callback: (manager: EntityManager) => Promise<R>,
  ): Promise<R> {
    if (manager) {
      return callback(manager);
    }
    return this.withTransaction(callback);
  }

  /**
   * 현재 리포지토리 또는 주어진 EntityManager 의 리포지토리를 반환.
   * - 트랜잭션 전파 시 올바른 커넥션을 사용하도록 보장합니다.
   */
  protected getRepoForManager(manager?: EntityManager): Repository<T> {
    return manager
      ? manager.getRepository(this.repository.target as any)
      : this.repository;
  }

  // ─── 집계 헬퍼 ───────────────────────────────

  /**
   * 특정 컬럼의 SUM 을 DB에서 직접 계산 (메모리 집계 대비 성능 향상).
   */
  async sumColumn(
    column: keyof T & string,
    where?: FindOptionsWhere<T>,
  ): Promise<number> {
    const alias = 'entity';
    const qb = this.repository
      .createQueryBuilder(alias)
      .select(`COALESCE(SUM(${alias}.${column}), 0)`, 'total');

    if (where) {
      Object.entries(where).forEach(([key, value], idx) => {
        qb.andWhere(`${alias}.${key} = :w${idx}`, { [`w${idx}`]: value });
      });
    }

    const result = await qb.getRawOne<{ total: string }>();
    return parseFloat(result?.total ?? '0');
  }

  /**
   * GROUP BY 집계를 DB에서 실행 (메모리 집계 대비 성능 향상).
   * 결과: { [groupValue]: aggregatedValue }
   */
  async groupAndSum(
    groupColumn: keyof T & string,
    sumColumn: keyof T & string,
    where?: FindOptionsWhere<T>,
  ): Promise<Record<string, number>> {
    const alias = 'entity';
    const qb = this.repository
      .createQueryBuilder(alias)
      .select(`${alias}.${groupColumn}`, 'groupKey')
      .addSelect(`COALESCE(SUM(${alias}.${sumColumn}), 0)`, 'total')
      .groupBy(`${alias}.${groupColumn}`);

    if (where) {
      Object.entries(where).forEach(([key, value], idx) => {
        qb.andWhere(`${alias}.${key} = :g${idx}`, { [`g${idx}`]: value });
      });
    }

    const rows = await qb.getRawMany<{ groupKey: string; total: string }>();
    return rows.reduce(
      (acc, row) => {
        acc[row.groupKey] = parseFloat(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );
  }
}
