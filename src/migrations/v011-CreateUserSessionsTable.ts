import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUserSessionsTableV011 implements MigrationInterface {
  name = 'CreateUserSessionsTableV011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // user_sessions 테이블 생성
    await queryRunner.createTable(
      new Table({
        name: 'user_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'session_id',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'session_token',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'refresh_token',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'login_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'expires_at',
            type: 'timestamp with time zone',
            isNullable: false,
          },
          {
            name: 'device_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'platform',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'ip_address',
            type: 'inet',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'last_seen_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'revoked_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        foreignKeys: [
          {
            columnNames: ['user_id'],
            referencedTableName: 'profiles',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          },
        ],
      }),
      true,
    );

    // 인덱스 생성
    await queryRunner.createIndex('user_sessions', new TableIndex({
      name: 'IDX_user_sessions_user_id',
      columnNames: ['user_id'],
    }));
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_user_sessions_session_token" ON "user_sessions" ("session_token")');
    await queryRunner.query('CREATE UNIQUE INDEX "UQ_user_sessions_session_id" ON "user_sessions" ("session_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 인덱스 삭제
    await queryRunner.dropIndex('user_sessions', 'UQ_user_sessions_session_id');
    await queryRunner.dropIndex('user_sessions', 'UQ_user_sessions_session_token');
    await queryRunner.dropIndex('user_sessions', 'IDX_user_sessions_user_id');

    // 테이블 삭제
    await queryRunner.dropTable('user_sessions');
  }
}
