import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateExpenseTables0003 implements MigrationInterface {
  name = 'CreateExpenseTables0003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create travel_expenses table
    await queryRunner.createTable(
      new Table({
        name: 'travel_expenses',
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
            name: 'title',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'note',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'currency',
            type: 'char',
            length: '3',
            isNullable: false,
          },
          {
            name: 'converted_amount',
            type: 'decimal',
            precision: 15,
            scale: 2,
            isNullable: false,
          },
          {
            name: 'expense_date',
            type: 'date',
            isNullable: false,
          },
          {
            name: 'category',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'author_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'payer_id',
            type: 'uuid',
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
            name: 'IDX_travel_expenses_travel_id',
            columnNames: ['travel_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_expenses_author_id',
            columnNames: ['author_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_expenses_payer_id',
            columnNames: ['payer_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_expenses_date',
            columnNames: ['expense_date'],
          }),
          new TableIndex({
            name: 'IDX_travel_expenses_category',
            columnNames: ['category'],
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
            columnNames: ['author_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'CASCADE',
          }),
          new TableForeignKey({
            columnNames: ['payer_id'],
            referencedTableName: 'users',
            referencedColumnNames: ['id'],
            onDelete: 'SET NULL',
          }),
        ],
      }),
      true
    );

    // Create travel_expense_participants table
    await queryRunner.createTable(
      new Table({
        name: 'travel_expense_participants',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'expense_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'user_id',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'NOW()',
            isNullable: false,
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_travel_expense_participants_expense_id',
            columnNames: ['expense_id'],
          }),
          new TableIndex({
            name: 'IDX_travel_expense_participants_user_id',
            columnNames: ['user_id'],
          }),
          new TableIndex({
            name: 'UQ_travel_expense_participants_expense_user',
            columnNames: ['expense_id', 'user_id'],
            isUnique: true,
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            columnNames: ['expense_id'],
            referencedTableName: 'travel_expenses',
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
    await queryRunner.dropTable('travel_expense_participants');
    await queryRunner.dropTable('travel_expenses');
  }
}