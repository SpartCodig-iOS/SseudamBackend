import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateJwtBlacklistTable1741580000000 implements MigrationInterface {
  name = 'CreateJwtBlacklistTable1741580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'jwt_blacklist',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'token_id',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'reason',
            type: 'enum',
            enum: ['logout', 'security', 'admin', 'refresh'],
            default: "'logout'",
            isNullable: false,
          },
          {
            name: 'expires_at',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'blacklisted_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes using raw SQL
    await queryRunner.query('CREATE UNIQUE INDEX "IDX_jwt_blacklist_token_id" ON "jwt_blacklist" ("token_id")');
    await queryRunner.query('CREATE INDEX "IDX_jwt_blacklist_user_id" ON "jwt_blacklist" ("user_id")');
    await queryRunner.query('CREATE INDEX "IDX_jwt_blacklist_expires_at" ON "jwt_blacklist" ("expires_at")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_jwt_blacklist_expires_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_jwt_blacklist_user_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_jwt_blacklist_token_id"');
    await queryRunner.dropTable('jwt_blacklist');
  }
}