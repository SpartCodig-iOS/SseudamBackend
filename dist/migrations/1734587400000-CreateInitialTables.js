"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateInitialTables1734587400000 = void 0;
class CreateInitialTables1734587400000 {
    constructor() {
        this.name = 'CreateInitialTables1734587400000';
    }
    async up(queryRunner) {
        // Create users table (profiles 테이블을 기반으로 한 users 테이블)
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" varchar(255) NOT NULL,
                "password_hash" varchar(255) NOT NULL,
                "name" varchar(100),
                "avatar_url" text,
                "username" varchar(50) NOT NULL,
                "role" varchar(20) NOT NULL DEFAULT 'user',
                "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                CONSTRAINT "PK_users_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_users_email" UNIQUE ("email"),
                CONSTRAINT "UQ_users_username" UNIQUE ("username")
            )
        `);
        // Create indexes for users
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_users_username" ON "users" ("username")`);
        // Create travels table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "travels" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "title" varchar(120) NOT NULL,
                "start_date" date NOT NULL,
                "end_date" date NOT NULL,
                "country_code" char(2) NOT NULL,
                "country_name_kr" varchar(50),
                "base_currency" char(3) NOT NULL,
                "base_exchange_rate" decimal(15,6) NOT NULL,
                "country_currencies" text NOT NULL,
                "budget" bigint,
                "budget_currency" char(3),
                "invite_code" varchar(32),
                "status" varchar(20) NOT NULL DEFAULT 'planning',
                "owner_id" uuid NOT NULL,
                "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                CONSTRAINT "PK_travels_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_travels_invite_code" UNIQUE ("invite_code"),
                CONSTRAINT "FK_travels_owner" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
        // Create indexes for travels
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travels_owner_id" ON "travels" ("owner_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travels_status" ON "travels" ("status")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travels_dates" ON "travels" ("start_date", "end_date")`);
        // Create travel_members table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "travel_members" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "travel_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "role" varchar(20) NOT NULL DEFAULT 'member',
                "joined_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                CONSTRAINT "PK_travel_members_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_travel_members_travel_user" UNIQUE ("travel_id", "user_id"),
                CONSTRAINT "FK_travel_members_travel" FOREIGN KEY ("travel_id") REFERENCES "travels"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_travel_members_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
        // Create indexes for travel_members
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_members_travel_id" ON "travel_members" ("travel_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_members_user_id" ON "travel_members" ("user_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_members_role" ON "travel_members" ("role")`);
        // Create travel_expenses table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "travel_expenses" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "travel_id" uuid NOT NULL,
                "title" varchar(50) NOT NULL,
                "note" text,
                "amount" decimal(15,2) NOT NULL,
                "currency" char(3) NOT NULL,
                "converted_amount" decimal(15,2) NOT NULL,
                "expense_date" date NOT NULL,
                "category" varchar(20),
                "author_id" uuid NOT NULL,
                "payer_id" uuid,
                "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                CONSTRAINT "PK_travel_expenses_id" PRIMARY KEY ("id"),
                CONSTRAINT "FK_travel_expenses_travel" FOREIGN KEY ("travel_id") REFERENCES "travels"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_travel_expenses_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_travel_expenses_payer" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE SET NULL
            )
        `);
        // Create indexes for travel_expenses
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expenses_travel_id" ON "travel_expenses" ("travel_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expenses_author_id" ON "travel_expenses" ("author_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expenses_payer_id" ON "travel_expenses" ("payer_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expenses_date" ON "travel_expenses" ("expense_date")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expenses_category" ON "travel_expenses" ("category")`);
        // Create travel_expense_participants table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "travel_expense_participants" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "expense_id" uuid NOT NULL,
                "user_id" uuid NOT NULL,
                "created_at" timestamp with time zone NOT NULL DEFAULT NOW(),
                CONSTRAINT "PK_travel_expense_participants_id" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_travel_expense_participants_expense_user" UNIQUE ("expense_id", "user_id"),
                CONSTRAINT "FK_travel_expense_participants_expense" FOREIGN KEY ("expense_id") REFERENCES "travel_expenses"("id") ON DELETE CASCADE,
                CONSTRAINT "FK_travel_expense_participants_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
            )
        `);
        // Create indexes for travel_expense_participants
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expense_participants_expense_id" ON "travel_expense_participants" ("expense_id")`);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_travel_expense_participants_user_id" ON "travel_expense_participants" ("user_id")`);
    }
    async down(queryRunner) {
        // Drop tables in reverse order (due to foreign key constraints)
        await queryRunner.query(`DROP TABLE IF EXISTS "travel_expense_participants"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "travel_expenses"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "travel_members"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "travels"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    }
}
exports.CreateInitialTables1734587400000 = CreateInitialTables1734587400000;
