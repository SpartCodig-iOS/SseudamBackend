"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddSettlementVersionAndAuditLog1741600000000 = void 0;
/**
 * 마이그레이션: 정산 신뢰성 강화
 *
 * 1. travel_settlements.version  — 낙관적 락용 정수 버전 컬럼
 * 2. settlement_audit_logs       — 정산 상태 변경 감사 로그 테이블
 * 3. expense_audit_logs          — 지출 수정/삭제 이력 테이블
 */
class AddSettlementVersionAndAuditLog1741600000000 {
    constructor() {
        this.name = 'AddSettlementVersionAndAuditLog1741600000000';
    }
    async up(queryRunner) {
        // ─────────────────────────────────────────────────────────────────
        // 1. travel_settlements 에 version 컬럼 추가 (낙관적 락)
        // ─────────────────────────────────────────────────────────────────
        await queryRunner.query(`
      ALTER TABLE travel_settlements
        ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1
    `);
        // 기존 행은 version = 1 로 초기화 (ADD COLUMN DEFAULT 로 이미 처리됨)
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_travel_settlements_version
        ON travel_settlements (travel_id, version)
    `);
        // ─────────────────────────────────────────────────────────────────
        // 2. settlement_audit_logs 테이블 생성
        // ─────────────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS settlement_audit_logs (
        id              uuid        NOT NULL DEFAULT gen_random_uuid(),
        travel_id       uuid        NOT NULL,
        settlement_id   uuid,                          -- NULL: saveComputedSettlements 전체 교체
        actor_id        uuid        NOT NULL,          -- 작업을 수행한 사용자 ID
        action          varchar(50) NOT NULL,          -- 'save_computed' | 'mark_completed' | 'delete_all'
        old_status      varchar(20),
        new_status      varchar(20),
        old_version     integer,
        new_version     integer,
        meta            jsonb,                         -- 추가 컨텍스트 (금액, 멤버 수 등)
        created_at      timestamp with time zone NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_settlement_audit_logs PRIMARY KEY (id),
        CONSTRAINT fk_sal_travel
          FOREIGN KEY (travel_id) REFERENCES travels(id) ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_settlement_audit_logs_travel
        ON settlement_audit_logs (travel_id, created_at DESC)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_settlement_audit_logs_settlement
        ON settlement_audit_logs (settlement_id)
        WHERE settlement_id IS NOT NULL
    `);
        // ─────────────────────────────────────────────────────────────────
        // 3. expense_audit_logs 테이블 생성
        // ─────────────────────────────────────────────────────────────────
        await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS expense_audit_logs (
        id          uuid        NOT NULL DEFAULT gen_random_uuid(),
        travel_id   uuid        NOT NULL,
        expense_id  uuid        NOT NULL,
        actor_id    uuid        NOT NULL,
        action      varchar(50) NOT NULL,              -- 'create' | 'update' | 'delete'
        snapshot    jsonb       NOT NULL,              -- 변경 전/후 지출 전체 스냅샷
        created_at  timestamp with time zone NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_expense_audit_logs PRIMARY KEY (id),
        CONSTRAINT fk_eal_travel
          FOREIGN KEY (travel_id) REFERENCES travels(id) ON DELETE CASCADE
      )
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expense_audit_logs_travel
        ON expense_audit_logs (travel_id, created_at DESC)
    `);
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expense_audit_logs_expense
        ON expense_audit_logs (expense_id, created_at DESC)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP TABLE IF EXISTS expense_audit_logs`);
        await queryRunner.query(`DROP TABLE IF EXISTS settlement_audit_logs`);
        await queryRunner.query(`
      ALTER TABLE travel_settlements
        DROP COLUMN IF EXISTS version
    `);
    }
}
exports.AddSettlementVersionAndAuditLog1741600000000 = AddSettlementVersionAndAuditLog1741600000000;
