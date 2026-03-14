import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateTravelTables0002 implements MigrationInterface {
  name = 'CreateTravelTables0002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create travels table
    await queryRunner.createTable(
      new Table({
        name: 'travels',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'title',
            type: 'varchar',
            length: '120',
            isNullable: false,
          },
          {
            name: 'start_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'end_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'country_code',
            type: 'char',
            length: '2',
            isNullable: false,
          },
          {
            name: 'country_name_kr',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'base_currency',
            type: 'char',
            length: '3',
            isNullable: false,
          },
          {
            name: 'base_exchange_rate',
            type: 'decimal',
            precision: 15,
            scale: 6,
            isNullable: false,
          },
          {
            name: 'country_currencies',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'budget',
            type: 'bigint',
            isNullable: true,
          },
          {
            name: 'budget_currency',
            type: 'char',
            length: '3',
            isNullable: true,
          },
          {
            name: 'invite_code',
            type: 'varchar',
            length: '32',
            isUnique: true,
            isNullable: true,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'planning'",
            isNullable: false,
          },
          {
            name: 'owner_id',
            type: 'uuid',
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
            name: 'IDX_travels_owner_id',
            columnNames: ['owner_id'],
          }),
          new TableIndex({
            name: 'IDX_travels_status',
            columnNames: ['status'],
          }),
          new TableIndex({
            name: 'IDX_travels_dates',
            columnNames: ['start_date', 'end_date'],
          }),
          new TableIndex({
            name: 'IDX_travels_invite_code',
            columnNames: ['invite_code'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['owner_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true
    );

    // Create travel_members table
    await queryRunner.createTable(
      new Table({
        name: 'travel_members',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'travel_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            default: "'member'",
            isNullable: false,
          },
          {
            name: 'joined_at',
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
            name: 'IDX_travel_members_travel_id',
            columnNames: ['travel_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_members_user_id',
            columnNames: ['user_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_members_role',
            columnNames: ['role'],
          }),
          new TableIndex({
            name: 'UQ_travel_members_travel_user',
            columnNames: ['travel_id', 'user_id'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['travel_id'],
            referencedTableName: 'travels',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
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
    await queryRunner.dropTable('travel_members');
    await queryRunner.dropTable('travels');
  }
}