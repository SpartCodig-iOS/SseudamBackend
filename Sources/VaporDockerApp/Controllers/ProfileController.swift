import Vapor
import Fluent

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
            email: user.email,
            name: user.name,
            avatarURL: user.avatarURL,
            username: user.username,
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
            try await user.delete(on: req.db)
        } catch {
            req.logger.error("Failed to delete user account: \(error.localizedDescription)")
            throw Abort(.internalServerError, reason: "Failed to delete user account")
        }

        let response = AccountDeletionResponse(userID: userID)
        return APIResponse.success(response, message: "Account deleted")
    }
}

struct UserProfileResponse: Content {
    let id: UUID
    let email: String
    let name: String?
    let avatarURL: String?
    let username: String
    let createdAt: Date?
    let updatedAt: Date?
}

struct AccountDeletionResponse: Content {
    let userID: UUID
}
