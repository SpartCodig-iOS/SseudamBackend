import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class FixDeviceTokensTable1741580000000 implements MigrationInterface {
  name = 'FixDeviceTokensTable1741580000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists and modify columns as needed
    const table = await queryRunner.getTable('device_tokens');
    if (!table) {
      // Create the table if it doesn't exist
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
              type: 'varchar',
              length: '255',
              isNullable: true, // Allow null for pending registrations
            },
            {
              name: 'pending_key',
              type: 'varchar',
              length: '255',
              isNullable: true, // For temporary storage before user login
            },
            {
              name: 'device_token',
              type: 'text',
              isNullable: false,
            },
            {
              name: 'platform',
              type: 'varchar',
              length: '20',
              isNullable: false,
            },
            {
              name: 'device_id',
              type: 'varchar',
              length: '255',
              isNullable: true,
            },
            {
              name: 'app_version',
              type: 'varchar',
              length: '50',
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
              type: 'timestamp',
              default: 'CURRENT_TIMESTAMP',
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
        }),
        true,
      );
    } else {
      // Add missing columns if they don't exist
      const hasLastUsedAt = table.findColumnByName('last_used_at');
      if (!hasLastUsedAt) {
        await queryRunner.query(`
          ALTER TABLE device_tokens
          ADD COLUMN last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
      }

      const hasPendingKey = table.findColumnByName('pending_key');
      if (!hasPendingKey) {
        await queryRunner.query(`
          ALTER TABLE device_tokens
          ADD COLUMN pending_key VARCHAR(255)
        `);
      }
    }

    // Create indexes
    const indexes = [
      new Index('IDX_device_tokens_user_id', ['user_id']),
      new Index('IDX_device_tokens_device_token', ['device_token'], { isUnique: true }),
      new Index('IDX_device_tokens_platform', ['platform']),
      new Index('IDX_device_tokens_active', ['is_active']),
      new Index('IDX_device_tokens_pending_key', ['pending_key']),
    ];

    for (const index of indexes) {
      try {
        await queryRunner.createIndex('device_tokens', index);
      } catch (error) {
        // Index might already exist, continue
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('device_tokens', true);
  }
}