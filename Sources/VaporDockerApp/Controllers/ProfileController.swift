import Vapor
import Fluent
import Supabase

struct ProfileController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        let protected = routes.grouped(JWTAuthenticator())
        protected.get("me", use: getCurrentUser)
        protected.get("profile", use: getUserProfile)
        protected.delete("profile", use: deleteAccount)
    }

    @Sendable
    func getCurrentUser(req: Request) async throws -> APIResponse<UserResponse> {
        let user = try req.requireAuthenticatedUser()
        let response = try UserResponse(from: user)
        return APIResponse.success(response)
    }

    @Sendable
    func getUserProfile(req: Request) async throws -> APIResponse<UserProfileResponse> {
        let user = try req.requireAuthenticatedUser()
        let response = UserProfileResponse(
            id: try user.requireID(),
            userId: user.username,
            email: user.email,
            name: user.name,
            avatarURL: user.avatarURL,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        )
        return APIResponse.success(response)
    }

    @Sendable
    func deleteAccount(req: Request) async throws -> APIResponse<AccountDeletionResponse> {
        let user = try req.requireAuthenticatedUser()
        let userID = try user.requireID()

        req.logger.info("Deleting user account", metadata: ["user_id": .string(userID.uuidString)])

        do {
            try await req.superbase.deleteUser(id: userID)
        } catch let authError as AuthError {
            if authError.isUserMissingError {
                req.logger.warning(
                    "Supabase user already missing, deleting local user only",
                    metadata: ["user_id": .string(userID.uuidString)]
                )
            } else {
                req.logger.error("Failed to delete Supabase user: \(authError.localizedDescription)")
                throw Abort(.internalServerError, reason: "Failed to delete user account")
            }
        } catch {
            if error.isSupabaseUserMissing {
                req.logger.warning(
                    "Supabase user deletion returned not found, deleting local user only",
                    metadata: ["user_id": .string(userID.uuidString)]
                )
            } else {
                req.logger.error("Failed to delete Supabase user: \(error.localizedDescription)")
                throw Abort(.internalServerError, reason: "Failed to delete user account")
            }
        }

        do {
            try await user.delete(on: req.db)
        } catch {
            req.logger.error("Failed to delete local user: \(error.localizedDescription)")
            throw Abort(.internalServerError, reason: "Failed to delete user account")
        }

        let response = AccountDeletionResponse(userID: userID)
        return APIResponse.success(response, message: "Account deleted")
    }
}

struct UserProfileResponse: Content {
    let id: UUID
    let userId: String
    let email: String
    let name: String?
    let avatarURL: String?
    let createdAt: Date?
    let updatedAt: Date?
}

struct AccountDeletionResponse: Content {
    let userID: UUID
}

private extension AuthError {
    var isUserMissingError: Bool {
        if errorCode == .userNotFound { return true }
        let candidates = [
            message.lowercased(),
            localizedDescription.lowercased(),
            String(describing: self).lowercased()
        ]
        return candidates.contains { value in
            value.contains("user not found") || value.contains("user_not_found")
        }
    }
}

private extension Error {
    var isSupabaseUserMissing: Bool {
        if let authError = self as? AuthError {
            return authError.isUserMissingError
        }
        return localizedDescription.lowercased().contains("user not found")
    }
}
