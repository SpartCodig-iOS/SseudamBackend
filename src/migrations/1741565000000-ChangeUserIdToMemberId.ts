import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeUserIdToMemberId1741565000000 implements MigrationInterface {
  name = 'ChangeUserIdToMemberId1741565000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // travel_expense_participants 테이블의 user_id 컬럼을 member_id로 변경
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      RENAME COLUMN "user_id" TO "member_id"
    `);

    // 기존 제약조건들 삭제
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      DROP CONSTRAINT IF EXISTS "UQ_travel_expense_participants_expense_user"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_travel_expense_participants_user_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      DROP CONSTRAINT IF EXISTS "FK_travel_expense_participants_user"
    `);

    // 새로운 제약조건들 생성
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      ADD CONSTRAINT "UQ_travel_expense_participants_expense_member"
      UNIQUE ("expense_id", "member_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_travel_expense_participants_member_id"
      ON "travel_expense_participants" ("member_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      ADD CONSTRAINT "FK_travel_expense_participants_member"
      FOREIGN KEY ("member_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 되돌리기: member_id를 다시 user_id로 변경
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      DROP CONSTRAINT IF EXISTS "UQ_travel_expense_participants_expense_member"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_travel_expense_participants_member_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      DROP CONSTRAINT IF EXISTS "FK_travel_expense_participants_member"
    `);

    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      RENAME COLUMN "member_id" TO "user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      ADD CONSTRAINT "UQ_travel_expense_participants_expense_user"
      UNIQUE ("expense_id", "user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_travel_expense_participants_user_id"
      ON "travel_expense_participants" ("user_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "travel_expense_participants"
      ADD CONSTRAINT "FK_travel_expense_participants_user"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);
  }
}