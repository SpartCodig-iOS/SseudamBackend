import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateOAuthTokenTable1741570000000 implements MigrationInterface {
  name = 'CreateOAuthTokenTable1741570000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'oauth_refresh_tokens',
        columns: [
          {
            name: 'id',
            type: 'serial',
            isPrimary: true,
          },
          {
            name: 'user_id',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'provider',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'refresh_token',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
        uniques: [
          {
            name: 'UQ_oauth_refresh_tokens_user_provider',
            columnNames: ['user_id', 'provider'],
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'oauth_refresh_tokens',
      new TableIndex({
        name: 'IDX_oauth_refresh_tokens_user_id',
        columnNames: ['user_id']
      })
    );

    await queryRunner.createIndex(
      'oauth_refresh_tokens',
      new TableIndex({
        name: 'IDX_oauth_refresh_tokens_provider',
        columnNames: ['provider']
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('oauth_refresh_tokens');
  }
}