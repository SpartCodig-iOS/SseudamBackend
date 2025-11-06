import Fluent
import FluentSQL

struct AddUsernameToUser: AsyncMigration {
    func prepare(on database: any Database) async throws {
        try await database.schema("users")
            .field("username", .string)
            .update()

        if let sql = database as? any SQLDatabase {
            try await sql.raw("""
                UPDATE "users"
                SET "username" = LOWER(split_part("email", '@', 1))
                WHERE "username" IS NULL OR "username" = '';
            """).run()

            try await sql.raw("""
                ALTER TABLE "users"
                ALTER COLUMN "username" SET NOT NULL;
            """).run()

            try await sql.raw("""
                CREATE UNIQUE INDEX IF NOT EXISTS "uq_users_username"
                ON "users" ("username");
            """).run()
        }
    }

    func revert(on database: any Database) async throws {
        if let sql = database as? any SQLDatabase {
            try await sql.raw("DROP INDEX IF EXISTS \"uq_users_username\";").run()
        }

        try await database.schema("users")
            .deleteField("username")
            .update()
    }
}
