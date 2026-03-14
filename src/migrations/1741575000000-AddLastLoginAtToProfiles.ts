import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddLastLoginAtToProfiles1741575000000 implements MigrationInterface {
  name = 'AddLastLoginAtToProfiles1741575000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists before adding
    const hasColumn = await queryRunner.hasColumn('profiles', 'last_login_at');

    if (!hasColumn) {
      await queryRunner.addColumn(
        'profiles',
        new TableColumn({
          name: 'last_login_at',
          type: 'timestamp with time zone',
          isNullable: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('profiles', 'last_login_at');

    if (hasColumn) {
      await queryRunner.dropColumn('profiles', 'last_login_at');
    }
  }
}