import { MigrationInterface, QueryRunner, Table, TableColumn, TableIndex, TableForeignKey } from 'typeorm';

/**
 * 마이그레이션: 정산 신뢰성 강화
 *
 * 1. travel_settlements.version  — 낙관적 락용 정수 버전 컬럼
 * 2. settlement_audit_logs       — 정산 상태 변경 감사 로그 테이블
 * 3. expense_audit_logs          — 지출 수정/삭제 이력 테이블
 */
export class AddSettlementVersionAndAuditLog0008 implements MigrationInterface {
  name = 'AddSettlementVersionAndAuditLog0008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─────────────────────────────────────────────────────────────────
    // 1. travel_settlements 에 version 컬럼 추가 (낙관적 락)
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.addColumn(
      'travel_settlements',
      new TableColumn({
        name: 'version',
        type: 'integer',
        default: 1,
        isNullable: false,
      })
    );

    // 기존 행은 version = 1 로 초기화
    await queryRunner.query(`UPDATE travel_settlements SET version = 1 WHERE version IS NULL`);

    // 인덱스 생성
    await queryRunner.createIndex(
      'travel_settlements',
      new TableIndex({
        name: 'idx_travel_settlements_version',
        columnNames: ['travel_id', 'version'],
      })
    );

    // ─────────────────────────────────────────────────────────────────
    // 2. settlement_audit_logs 테이블 생성
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'settlement_audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'travel_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'settlement_id',
            type: 'uuid',
            isNullable: true, // NULL: saveComputedSettlements 전체 교체
          },
          {
            name: 'actor_id',
            type: 'uuid',
            isNullable: false, // 작업을 수행한 사용자 ID
          },
          {
            name: 'action',
            type: 'varchar',
            length: '50',
            isNullable: false, // 'save_computed' | 'mark_completed' | 'delete_all'
          },
          {
            name: 'old_status',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'new_status',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'old_version',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'new_version',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'meta',
            type: 'jsonb',
            isNullable: true, // 추가 컨텍스트 (금액, 멤버 수 등)
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        indices: [
          new TableIndex({
            name: 'idx_settlement_audit_logs_travel',
            columnNames: ['travel_id', 'created_at'],
          }),
          new TableIndex({
            name: 'idx_settlement_audit_logs_settlement',
            columnNames: ['settlement_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['travel_id'],
            referencedTableName: 'travels',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true
    );

    // settlement_id가 NULL이 아닌 경우에만 적용되는 partial index
    await queryRunner.query(`
      CREATE INDEX idx_settlement_audit_logs_settlement_filtered
      ON settlement_audit_logs (settlement_id)
      WHERE settlement_id IS NOT NULL
    `);

    // ─────────────────────────────────────────────────────────────────
    // 3. expense_audit_logs 테이블 생성
    // ─────────────────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'expense_audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'travel_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'expense_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'actor_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'action',
            type: 'varchar',
            length: '50',
            isNullable: false, // 'create' | 'update' | 'delete'
          },
          {
            name: 'snapshot',
            type: 'jsonb',
            isNullable: false, // 변경 전/후 지출 전체 스냅샷
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        indices: [
          new TableIndex({
            name: 'idx_expense_audit_logs_travel',
            columnNames: ['travel_id', 'created_at'],
          }),
          new TableIndex({
            name: 'idx_expense_audit_logs_expense',
            columnNames: ['expense_id', 'created_at'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['travel_id'],
            referencedTableName: 'travels',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('expense_audit_logs');
    await queryRunner.dropTable('settlement_audit_logs');
    await queryRunner.dropColumn('travel_settlements', 'version');
  }
}