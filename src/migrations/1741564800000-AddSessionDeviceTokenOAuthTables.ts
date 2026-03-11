import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: user_sessions, device_tokens, oauth_refresh_tokens 테이블 생성
 *
 * 기존 pool.query() 기반 코드에서 관리되던 3개 테이블을
 * TypeORM Entity / Repository 패턴으로 전환하기 위해
 * IF NOT EXISTS 구문을 사용해 안전하게 생성합니다.
 *
 * 테이블이 이미 존재하는 환경(운영 DB 등)에서도 오류 없이 실행됩니다.
 */
export class AddSessionDeviceTokenOAuthTables1741564800000
  implements MigrationInterface
{
  name = 'AddSessionDeviceTokenOAuthTables1741564800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── 1. user_sessions ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_sessions" (
        "session_id"   uuid         NOT NULL,
        "user_id"      uuid         NOT NULL,
        "login_type"   varchar(20)  NOT NULL,
        "last_seen_at" timestamptz  NOT NULL DEFAULT NOW(),
        "expires_at"   timestamptz  NOT NULL,
        "revoked_at"   timestamptz,
        "created_at"   timestamptz  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_user_sessions_session_id"  PRIMARY KEY ("session_id"),
        CONSTRAINT "UQ_user_sessions_user_id"     UNIQUE ("user_id"),
        CONSTRAINT "FK_user_sessions_user"        FOREIGN KEY ("user_id")
          REFERENCES "profiles" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_sessions_session_id" ON "user_sessions" ("session_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_sessions_user_id"    ON "user_sessions" ("user_id")`,
    );

    // ─── 2. device_tokens ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_tokens" (
        "id"           uuid         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"      uuid,
        "pending_key"  varchar(255),
        "device_token" varchar(512) NOT NULL,
        "platform"     varchar(20)  NOT NULL DEFAULT 'ios',
        "is_active"    boolean      NOT NULL DEFAULT true,
        "last_used_at" timestamptz  NOT NULL DEFAULT NOW(),
        "created_at"   timestamptz  NOT NULL DEFAULT NOW(),
        "updated_at"   timestamptz  NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_device_tokens_id"       PRIMARY KEY ("id"),
        CONSTRAINT "UQ_device_tokens_token"    UNIQUE ("device_token"),
        CONSTRAINT "FK_device_tokens_user"     FOREIGN KEY ("user_id")
          REFERENCES "profiles" ("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_id"      ON "device_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_device_tokens_pending_key"  ON "device_tokens" ("pending_key")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_device_tokens_device_token" ON "device_tokens" ("device_token")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_active"  ON "device_tokens" ("user_id", "is_active")`,
    );

    // ─── 3. oauth_refresh_tokens ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "oauth_refresh_tokens" (
        "id"            uuid        NOT NULL DEFAULT gen_random_uuid(),
        "user_id"       uuid        NOT NULL,
        "provider"      varchar(30) NOT NULL,
        "refresh_token" text        NOT NULL,
        "created_at"    timestamptz NOT NULL DEFAULT NOW(),
        "updated_at"    timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "PK_oauth_refresh_tokens_id"          PRIMARY KEY ("id"),
        CONSTRAINT "UQ_oauth_refresh_tokens_user_provider" UNIQUE ("user_id", "provider"),
        CONSTRAINT "FK_oauth_refresh_tokens_user"        FOREIGN KEY ("user_id")
          REFERENCES "profiles" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_user_id"       ON "oauth_refresh_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_oauth_tokens_user_provider" ON "oauth_refresh_tokens" ("user_id", "provider")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 역순으로 삭제 (FK 제약 준수)
    await queryRunner.query(`DROP TABLE IF EXISTS "oauth_refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_sessions"`);
  }
}
