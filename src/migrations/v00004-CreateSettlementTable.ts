import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateSettlementTable0004 implements MigrationInterface {
  name = 'CreateSettlementTable0004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create travel_settlements table
    await queryRunner.createTable(
      new Table({
        name: 'travel_settlements',
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
            name: 'from_member',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'to_member',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'status',
            type: 'varchar',
            length: '20',
            default: "'pending'",
            isNullable: false,
          },
          {
            name: 'completed_at',
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
            name: 'IDX_travel_settlements_travel_id',
            columnNames: ['travel_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_settlements_from_member',
            columnNames: ['from_member'],
          }),
          new TableIndex({
            name: 'IDX_travel_settlements_to_member',
            columnNames: ['to_member'],
          }),
          new TableIndex({
            name: 'IDX_travel_settlements_status',
            columnNames: ['status'],
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
            columnNames: ['from_member'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['to_member'],
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
    await queryRunner.dropTable('travel_settlements');
  }
}