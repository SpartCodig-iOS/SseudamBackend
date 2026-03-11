import { DataSource, EntityManager, ObjectLiteral, SelectQueryBuilder } from 'typeorm';

// ────────────────────────────────────────────────
// N+1 해결 헬퍼 타입
// ────────────────────────────────────────────────

export type IdExtractor<T> = (item: T) => string | null | undefined;
export type RelationLoader<R> = (ids: string[]) => Promise<R[]>;
export type RelationKeyExtractor<R> = (rel: R) => string;
export type RelationSetter<T, R> = (item: T, relations: R[]) => void;

// ────────────────────────────────────────────────
// DataLoader 패턴 (N+1 문제 해결)
// ────────────────────────────────────────────────

/**
 * N+1 문제를 해결하는 배치 관계 로드 유틸리티.
 *
 * @example
 * // 여행 목록에 멤버 정보를 N+1 없이 로드
 * await batchLoadRelation(
 *   travels,
 *   (travel) => travel.id,
 *   (travelIds) => memberRepo.findByTravelIds(travelIds),
 *   (member) => member.travelId,
 *   (travel, members) => { travel.members = members; },
 * );
 */
export async function batchLoadRelation<T, R>(
  items: T[],
  getItemId: IdExtractor<T>,
  loadRelations: RelationLoader<R>,
  getRelationKey: RelationKeyExtractor<R>,
  setRelation: RelationSetter<T, R>,
): Promise<void> {
  if (items.length === 0) return;

  // 고유 ID 수집
  const ids = [...new Set(items.map(getItemId).filter(Boolean))] as string[];
  if (ids.length === 0) return;

  // 단일 IN 쿼리로 모든 관계 한 번에 로드
  const relations = await loadRelations(ids);

  // ID → relations 맵 구성
  const map = new Map<string, R[]>();
  for (const rel of relations) {
    const key = getRelationKey(rel);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(rel);
  }

  // 각 항목에 관계 할당
  for (const item of items) {
    const id = getItemId(item);
    setRelation(item, id ? (map.get(id) ?? []) : []);
  }
}

/**
 * 단일 관계 (N:1) 배치 로드.
 *
 * @example
 * await batchLoadSingleRelation(
 *   expenses,
 *   (expense) => expense.payerId,
 *   (ids) => userRepo.findByIds(ids),
 *   (user) => user.id,
 *   (expense, user) => { expense.payer = user ?? null; },
 * );
 */
export async function batchLoadSingleRelation<T, R>(
  items: T[],
  getRelationId: (item: T) => string | null | undefined,
  loadEntities: (ids: string[]) => Promise<R[]>,
  getEntityId: (entity: R) => string,
  setRelation: (item: T, entity: R | null) => void,
): Promise<void> {
  if (items.length === 0) return;

  const ids = [...new Set(items.map(getRelationId).filter(Boolean))] as string[];
  if (ids.length === 0) return;

  const entities = await loadEntities(ids);
  const entityMap = new Map(entities.map((e) => [getEntityId(e), e]));

  for (const item of items) {
    const id = getRelationId(item);
    setRelation(item, id ? (entityMap.get(id) ?? null) : null);
  }
}

// ────────────────────────────────────────────────
// QueryBuilder 유틸리티
// ────────────────────────────────────────────────

/**
 * IN 조건을 안전하게 추가합니다.
 * 빈 배열이면 항상 false 조건을 추가해 잘못된 전체 조회를 방지합니다.
 */
export function addInCondition<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  values: string[],
  paramName: string,
): SelectQueryBuilder<T> {
  if (values.length === 0) {
    return qb.andWhere('1 = 0');
  }
  return qb.andWhere(`${column} IN (:...${paramName})`, { [paramName]: values });
}

/**
 * 날짜 범위 조건을 안전하게 추가합니다.
 */
export function addDateRangeCondition<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  startDate?: string,
  endDate?: string,
): SelectQueryBuilder<T> {
  if (startDate) {
    qb.andWhere(`${column} >= :rangeStart`, { rangeStart: startDate });
  }
  if (endDate) {
    qb.andWhere(`${column} <= :rangeEnd`, { rangeEnd: endDate });
  }
  return qb;
}

// ────────────────────────────────────────────────
// 대용량 데이터 스트리밍 처리
// ────────────────────────────────────────────────

/**
 * 대용량 결과를 청크 단위로 스트리밍 처리합니다.
 * - 전체를 메모리에 올리지 않아 OOM 위험을 줄입니다.
 * - 각 청크를 처리한 후 즉시 GC 가능 상태가 됩니다.
 *
 * @example
 * await streamQuery(
 *   dataSource,
 *   'SELECT id, converted_amount FROM travel_expenses WHERE travel_id = $1',
 *   [travelId],
 *   500,
 *   async (chunk) => { await processChunk(chunk); }
 * );
 */
export async function streamQuery<T = Record<string, unknown>>(
  dataSource: DataSource,
  sql: string,
  params: unknown[],
  chunkSize: number,
  processor: (chunk: T[]) => Promise<void>,
): Promise<void> {
  let offset = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const paginatedSql = `${sql} LIMIT ${chunkSize} OFFSET ${offset}`;
    const rows: T[] = await dataSource.query(paginatedSql, params);

    if (rows.length === 0) break;

    await processor(rows);

    if (rows.length < chunkSize) break;
    offset += chunkSize;
  }
}

// ────────────────────────────────────────────────
// UNNEST 기반 배치 INSERT 헬퍼
// ────────────────────────────────────────────────

/**
 * PostgreSQL UNNEST 를 사용한 고성능 배치 INSERT.
 * TypeORM의 bulkInsert 보다 파라미터 수 제한에 자유롭습니다.
 *
 * @example
 * await unnestInsert(manager, 'travel_expense_participants', [
 *   { column: 'expense_id', type: 'uuid', values: expenseIds },
 *   { column: 'member_id', type: 'uuid', values: memberIds },
 *   { column: 'split_amount', type: 'numeric', values: amounts },
 * ]);
 */
export interface UnnestColumn {
  column: string;
  type: string;
  values: unknown[];
}

export async function unnestInsert(
  manager: EntityManager | DataSource,
  tableName: string,
  columns: UnnestColumn[],
): Promise<void> {
  if (columns.length === 0 || columns[0].values.length === 0) return;

  const colNames = columns.map((c) => c.column).join(', ');
  const unnestParts = columns
    .map((c, i) => `$${i + 1}::${c.type}[]`)
    .join(', ');
  const aliasParts = columns.map((c) => c.column).join(', ');

  const sql = `
    INSERT INTO ${tableName} (${colNames})
    SELECT ${aliasParts}
    FROM UNNEST(${unnestParts}) AS t(${aliasParts})
  `;

  const params = columns.map((c) => c.values);

  if (manager instanceof DataSource) {
    await manager.query(sql, params);
  } else {
    await manager.query(sql, params);
  }
}

// ────────────────────────────────────────────────
// 통계 집계 헬퍼
// ────────────────────────────────────────────────

export interface ExpenseStatsRow {
  totalAmount: number;
  totalConverted: number;
  expenseCount: number;
  categoryBreakdown: Record<string, number>;
  currencyBreakdown: Record<string, number>;
}

/**
 * 지출 통계를 DB에서 직접 집계합니다.
 * 기존 코드의 "전체 지출을 메모리로 가져와서 JS에서 집계" 패턴을 대체합니다.
 */
export async function aggregateExpenseStats(
  dataSource: DataSource,
  travelId: string,
  startDate?: string,
  endDate?: string,
): Promise<ExpenseStatsRow> {
  const params: unknown[] = [travelId];
  let dateFilter = '';
  let paramIdx = 2;

  if (startDate) {
    dateFilter += ` AND expense_date >= $${paramIdx++}`;
    params.push(startDate);
  }
  if (endDate) {
    dateFilter += ` AND expense_date <= $${paramIdx++}`;
    params.push(endDate);
  }

  const [totalsResult, categoryResult, currencyResult] = await Promise.all([
    // 총합 및 건수
    dataSource.query<Array<{ total_amount: string; total_converted: string; expense_count: string }>>(
      `SELECT
         COALESCE(SUM(amount), 0)           AS total_amount,
         COALESCE(SUM(converted_amount), 0) AS total_converted,
         COUNT(*)                           AS expense_count
       FROM travel_expenses
       WHERE travel_id = $1 ${dateFilter}`,
      params,
    ),
    // 카테고리별 합산 (DB GROUP BY)
    dataSource.query<Array<{ category: string; total: string }>>(
      `SELECT
         COALESCE(category, 'other') AS category,
         COALESCE(SUM(converted_amount), 0) AS total
       FROM travel_expenses
       WHERE travel_id = $1 ${dateFilter}
       GROUP BY category`,
      params,
    ),
    // 통화별 합산 (DB GROUP BY)
    dataSource.query<Array<{ currency: string; total: string }>>(
      `SELECT
         currency,
         COALESCE(SUM(amount), 0) AS total
       FROM travel_expenses
       WHERE travel_id = $1 ${dateFilter}
       GROUP BY currency`,
      params,
    ),
  ]);

  const totals = totalsResult[0];

  const categoryBreakdown = categoryResult.reduce(
    (acc, row) => {
      acc[row.category] = parseFloat(row.total);
      return acc;
    },
    {} as Record<string, number>,
  );

  const currencyBreakdown = currencyResult.reduce(
    (acc, row) => {
      acc[row.currency] = parseFloat(row.total);
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    totalAmount: parseFloat(totals?.total_amount ?? '0'),
    totalConverted: parseFloat(totals?.total_converted ?? '0'),
    expenseCount: parseInt(totals?.expense_count ?? '0', 10),
    categoryBreakdown,
    currencyBreakdown,
  };
}

// ────────────────────────────────────────────────
// 멤버별 지출 통계 헬퍼 (단일 쿼리)
// ────────────────────────────────────────────────

export interface UserExpenseStatsRow {
  totalPaid: number;
  participatedCount: number;
  authoredCount: number;
}

/**
 * 사용자별 지출 통계를 단일 쿼리로 집계합니다.
 * 기존의 3번 개별 쿼리를 1번으로 줄입니다.
 */
export async function aggregateUserExpenseStats(
  dataSource: DataSource,
  travelId: string,
  userId: string,
): Promise<UserExpenseStatsRow> {
  const rows = await dataSource.query<
    Array<{
      total_paid: string;
      participated_count: string;
      authored_count: string;
    }>
  >(
    `SELECT
       COALESCE(SUM(CASE WHEN te.payer_id = $2 THEN te.converted_amount ELSE 0 END), 0) AS total_paid,
       COUNT(DISTINCT CASE WHEN tep.member_id = $2 THEN te.id END)                        AS participated_count,
       COUNT(DISTINCT CASE WHEN te.author_id = $2 THEN te.id END)                         AS authored_count
     FROM travel_expenses te
     LEFT JOIN travel_expense_participants tep ON tep.expense_id = te.id
     WHERE te.travel_id = $1`,
    [travelId, userId],
  );

  const row = rows[0];
  return {
    totalPaid: parseFloat(row?.total_paid ?? '0'),
    participatedCount: parseInt(row?.participated_count ?? '0', 10),
    authoredCount: parseInt(row?.authored_count ?? '0', 10),
  };
}

// ────────────────────────────────────────────────
// 여행 목록 집계 헬퍼 (멤버 수 + 총 지출 포함)
// ────────────────────────────────────────────────

export interface TravelListAggregateRow {
  id: string;
  memberCount: number;
  totalExpenses: number;
  expenseCount: number;
}

/**
 * 여행 목록에 필요한 집계 정보를 단일 쿼리로 조회합니다.
 * 기존의 여행별 개별 getTravelStats() 호출 (N+1) 을 대체합니다.
 */
export async function aggregateTravelListStats(
  dataSource: DataSource,
  travelIds: string[],
): Promise<Map<string, TravelListAggregateRow>> {
  if (travelIds.length === 0) return new Map();

  const rows = await dataSource.query<
    Array<{
      travel_id: string;
      member_count: string;
      total_expenses: string;
      expense_count: string;
    }>
  >(
    `SELECT
       t.id::text                               AS travel_id,
       COUNT(DISTINCT tm.user_id)               AS member_count,
       COALESCE(SUM(te.converted_amount), 0)    AS total_expenses,
       COUNT(DISTINCT te.id)                    AS expense_count
     FROM travels t
     LEFT JOIN travel_members  tm ON tm.travel_id = t.id
     LEFT JOIN travel_expenses te ON te.travel_id = t.id
     WHERE t.id = ANY($1::uuid[])
     GROUP BY t.id`,
    [travelIds],
  );

  const map = new Map<string, TravelListAggregateRow>();
  for (const row of rows) {
    map.set(row.travel_id, {
      id: row.travel_id,
      memberCount: parseInt(row.member_count, 10),
      totalExpenses: parseFloat(row.total_expenses),
      expenseCount: parseInt(row.expense_count, 10),
    });
  }
  return map;
}
