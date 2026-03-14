import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateJwtBlacklistTable0007 implements MigrationInterface {
  name = 'CreateJwtBlacklistTable0007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // JWT 블랙리스트 테이블 생성
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
        indices: [
          new TableIndex({
            name: 'IDX_jwt_blacklist_token_id',
            columnNames: ['token_id'],
            isUnique: true,
          }),
          new TableIndex({
            name: 'IDX_jwt_blacklist_user_id',
            columnNames: ['user_id'],
          }),
          new TableIndex({
            name: 'IDX_jwt_blacklist_expires_at',
            columnNames: ['expires_at'],
          }),
          new TableIndex({
            name: 'IDX_jwt_blacklist_user_expires',
            columnNames: ['user_id', 'expires_at'],
          }),
          new TableIndex({
            name: 'IDX_jwt_blacklist_blacklisted_at',
            columnNames: ['blacklisted_at'],
          }),
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('jwt_blacklist');
  }
}