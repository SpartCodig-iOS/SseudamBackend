import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateAppVersionTable0005 implements MigrationInterface {
  name = 'CreateAppVersionTable0005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create app_versions table
    await queryRunner.createTable(
      new Table({
        name: 'app_versions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'platform',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '20',
            isNullable: false,
          },
          {
            name: 'build_number',
            type: 'integer',
            isNullable: false,
          },
          {
            name: 'is_required',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_app_versions_platform',
            columnNames: ['platform'],
          }),
          new TableIndex({
            name: 'IDX_app_versions_version',
            columnNames: ['version'],
          }),
          new TableIndex({
            name: 'UQ_app_versions_platform_version',
            columnNames: ['platform', 'version'],
            isUnique: true,
          }),
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('app_versions');
  }
}