import Vapor
import JWT
import Foundation
import Fluent
import Logging

struct JWTService {
    let signers: JWTSigners
    private let accessTokenTTL: TimeInterval = 24 * 60 * 60
    private let refreshTokenTTL: TimeInterval = 7 * 24 * 60 * 60

    init(signers: JWTSigners) {
        self.signers = signers
    }

    // MARK: - Token Generation
    func generateTokenPair(for user: User) throws -> TokenPair {
        let (accessToken, accessExpiresAt) = try generateAccessToken(for: user)
        let (refreshToken, refreshExpiresAt) = try generateRefreshToken(for: user)
        return TokenPair(
            accessToken: accessToken,
            accessTokenExpiresAt: accessExpiresAt,
            refreshToken: refreshToken,
            refreshTokenExpiresAt: refreshExpiresAt
        )
    }

    private func generateAccessToken(for user: User) throws -> (token: String, expiresAt: Date) {
        guard let userID = user.id else {
            throw Abort(.internalServerError, reason: "User missing ID")
        }

        let expirationDate = Date().addingTimeInterval(accessTokenTTL)

        let payload = UserPayload(
            subject: userID.uuidString,
            expiration: expirationDate,
            email: user.email,
            name: user.name
        )

        let token = try signers.sign(payload)
        return (token: token, expiresAt: expirationDate)
    }

    private func generateRefreshToken(for user: User) throws -> (token: String, expiresAt: Date) {
        guard let userID = user.id else {
            throw Abort(.internalServerError, reason: "User missing ID")
        }

        let expirationDate = Date().addingTimeInterval(refreshTokenTTL)
        let payload = RefreshTokenPayload(subject: userID.uuidString, expiration: expirationDate)
        let token = try signers.sign(payload)
        return (token: token, expiresAt: expirationDate)
    }

    // MARK: - Token Verification
    func verifyAccessToken(_ token: String) throws -> UserPayload {
        return try signers.verify(token, as: UserPayload.self)
    }

    func verifyRefreshToken(_ token: String) throws -> RefreshTokenPayload {
        return try signers.verify(token, as: RefreshTokenPayload.self)
    }

    // MARK: - Extract User ID from Token
    func getUserID(from token: String) throws -> UUID {
        let payload = try verifyAccessToken(token)
        guard let uuid = UUID(uuidString: payload.subject.value) else {
            throw Abort(.unauthorized, reason: "Invalid user ID in token")
        }
        return uuid
    }
}

// MARK: - Service Registration
extension Application {
    var jwtService: JWTService {
        JWTService(signers: jwt.signers)
    }
}

extension Request {
    var jwtService: JWTService {
        application.jwtService
    }
}

// MARK: - JWT Middleware
struct JWTAuthenticator: AsyncBearerAuthenticator {
    typealias User = VaporDockerApp.User

    func authenticate(bearer: BearerAuthorization, for request: Request) async throws {
        do {
            let payload = try request.jwtService.verifyAccessToken(bearer.token)
            let userID = UUID(uuidString: payload.subject.value)!

            if let user = try await User.find(userID, on: request.db) {
                request.auth.login(user)
                request.logger.debug("Authenticated via local JWT", metadata: [
                    "user_id": .string(userID.uuidString)
                ])
                return
            }
        } catch {
            request.logger.debug("Local JWT verification failed", metadata: [
                "reason": .string(error.localizedDescription)
            ])
        }

        do {
            let remoteUser = try await request.superbase.getUser(token: bearer.token)
            guard let email = remoteUser.email else {
            request.logger.debug("Superbase token validated but email missing")
                return
            }

            if let localUser = try await User.query(on: request.db)
                .filter(\.$email == email.lowercased())
                .first() {
                request.auth.login(localUser)
                request.logger.debug("Authenticated via Superbase token", metadata: [
                    "email": .string(email)
                ])
            } else {
                request.logger.warning("Superbase token valid but no local user matches email", metadata: [
                    "email": .string(email)
                ])
            }
        } catch {
            request.logger.debug("Superbase token verification failed", metadata: [
                "reason": .string(error.localizedDescription)
            ])
        }
    }
}

// MARK: - Token Pair DTO
struct TokenPair {
    let accessToken: String
    let accessTokenExpiresAt: Date
    let refreshToken: String
    let refreshTokenExpiresAt: Date
}

// MARK: - Authentication Helper
extension Request {
    var authenticatedUser: User? {
        return auth.get(User.self)
    }

    func requireAuthenticatedUser() throws -> User {
        guard let user = authenticatedUser else {
            throw Abort(.unauthorized, reason: "User not authenticated")
        }
        return user
    }
}
