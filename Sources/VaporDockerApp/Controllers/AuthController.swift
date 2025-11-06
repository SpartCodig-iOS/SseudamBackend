import Vapor
import Fluent
import Supabase

struct AuthController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
        routes.post("login", use: login)
        routes.post("refresh", use: refresh)
    }

    @Sendable
    func login(req: Request) async throws -> APIResponse<AuthResponse> {
        try UserLogin.validate(content: req)
        let userLogin = try req.content.decode(UserLogin.self)

        let identifier = userLogin.identifier.lowercased()
        let userQuery = User.query(on: req.db)

        let user: User?
        if identifier.contains("@") {
            user = try await userQuery.filter(\.$email == identifier).first()
        } else {
            user = try await userQuery.filter(\.$username == identifier).first()
        }

        guard let user else {
            throw Abort(.unauthorized, reason: "Invalid email or password")
        }

        guard try user.verify(password: userLogin.password) else {
            throw Abort(.unauthorized, reason: "Invalid email or password")
        }

        req.logger.info("Verifying Superbase credentials", metadata: ["email": .string(user.email)])
        do {
            _ = try await req.superbase.signIn(
                email: user.email,
                password: userLogin.password
            )
            req.logger.info("Superbase credentials verified", metadata: ["email": .string(user.email)])
        } catch {
            req.logger.warning(
                "Superbase 로그인 검증에 실패했습니다: \(error.localizedDescription)",
                metadata: ["email": .string(user.email)]
            )
        }

        return APIResponse.success(try buildAuthResponse(for: user, req: req), message: "Login successful")
    }

    @Sendable
    func refresh(req: Request) async throws -> APIResponse<AuthResponse> {
        let refreshRequest = try req.content.decode(RefreshTokenRequest.self)
        let refreshPayload = try req.jwtService.verifyRefreshToken(refreshRequest.refreshToken)

        guard
            let userID = UUID(uuidString: refreshPayload.subject.value),
            let user = try await User.find(userID, on: req.db)
        else {
            throw Abort(.unauthorized, reason: "Invalid refresh token")
        }

        return APIResponse.success(try buildAuthResponse(for: user, req: req), message: "Token refreshed")
    }

    private func buildAuthResponse(for user: User, req: Request) throws -> AuthResponse {
        let tokenPair = try req.jwtService.generateTokenPair(for: user)
        let userResponse = try UserResponse(from: user)
        return AuthResponse(
            user: userResponse,
            accessToken: tokenPair.accessToken,
            expiresAt: tokenPair.accessTokenExpiresAt,
            refreshToken: tokenPair.refreshToken,
            refreshExpiresAt: tokenPair.refreshTokenExpiresAt
        )
    }
}
