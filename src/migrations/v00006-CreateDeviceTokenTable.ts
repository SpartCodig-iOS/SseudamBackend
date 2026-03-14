import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateDeviceTokenTable0006 implements MigrationInterface {
  name = 'CreateDeviceTokenTable0006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create device_tokens table
    await queryRunner.createTable(
      new Table({
        name: 'device_tokens',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'token',
            type: 'varchar',
            length: '255',
            isUnique: true,
            isNullable: false,
          },
          {
            name: 'platform',
            type: 'varchar',
            length: '10',
            isNullable: false,
          },
          {
            name: 'device_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'is_active',
            type: 'boolean',
            default: true,
            isNullable: false,
          },
          {
            name: 'last_used_at',
            type: 'timestamp with time zone',
            isNullable: true,
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
            name: 'IDX_device_tokens_user_id',
            columnNames: ['user_id'],
          }),
          new TableIndex({
            name: 'IDX_device_tokens_platform',
            columnNames: ['platform'],
          }),
          new TableIndex({
            name: 'IDX_device_tokens_token',
            columnNames: ['token'],
          }),
          new TableIndex({
            name: 'IDX_device_tokens_device_id',
            columnNames: ['device_id'],
          }),
          new TableIndex({
            name: 'UQ_device_tokens_user_device',
            columnNames: ['user_id', 'device_id'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['user_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('device_tokens');
  }
}