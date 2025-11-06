import Vapor
import Fluent
import Supabase

struct SignupController: RouteCollection {
    func boot(routes: any RoutesBuilder) throws {
    routes.post("signup", use: signup)
  }

  @Sendable
  func signup(req: Request) async throws -> APIResponse<AuthResponse> {
    try UserSignup.validate(content: req)
    let userSignup = try req.content.decode(UserSignup.self)

    let normalizedEmail = userSignup.email.lowercased()
    let derivedUsername = normalizedEmail
      .split(separator: "@")
      .first
      .map(String.init)?
      .lowercased() ?? normalizedEmail

    if let _ = try await User.query(on: req.db)
      .filter(\.$email == normalizedEmail)
      .first() {
      throw Abort(.conflict, reason: "User with this email already exists")
    }

    if let _ = try await User.query(on: req.db)
      .filter(\.$username == derivedUsername)
      .first() {
      throw Abort(.conflict, reason: "Username already taken. Please choose a different email")
    }

    var metadata: [String: String] = ["username": derivedUsername]
    if let name = userSignup.name {
      metadata["name"] = name
    }

    let authResponse: SuperbaseAuthResponse
    req.logger.info("Creating Superbase auth user via admin API", metadata: ["email": .string(normalizedEmail)])
    do {
        authResponse = try await req.superbase.signUp(
            email: normalizedEmail,
            password: userSignup.password,
            metadata: metadata
        )
        req.logger.info(
            "Superbase auth user created",
            metadata: ["superbase_user_id": .string(authResponse.user.id.uuidString)]
        )
    } catch {
        if let conflict = mapSuperbaseSignupError(error) {
            throw conflict
        }
        req.logger.error("Superbase 회원가입에 실패했습니다: \(error.localizedDescription)")
        throw Abort(.internalServerError, reason: "Superbase 사용자 등록에 실패했습니다.")
    }

    let hashedPassword = try Bcrypt.hash(userSignup.password)
    let user = User(
      email: normalizedEmail,
      passwordHash: hashedPassword,
      name: userSignup.name,
      avatarURL: nil,
      username: derivedUsername
    )
    try await user.save(on: req.db)

    req.logger.info(
        "Upserting Superbase profile",
        metadata: [
            "superbase_user_id": .string(authResponse.user.id.uuidString),
            "email": .string(user.email)
        ]
    )
    do {
        try await req.superbase.upsertProfile(
            userID: authResponse.user.id,
            email: user.email,
            name: user.name,
            username: user.username
        )
        req.logger.info(
            "Superbase profile upserted",
            metadata: ["superbase_user_id": .string(authResponse.user.id.uuidString)]
        )
    } catch {
        try await user.delete(on: req.db)
        req.logger.error("Superbase 프로필 동기화에 실패했습니다: \(error.localizedDescription)")
        throw Abort(.internalServerError, reason: "Superbase 사용자 동기화에 실패했습니다.")
    }

    let tokenPair = try req.jwtService.generateTokenPair(for: user)
    let userResponse = try UserResponse(from: user)

    let response = AuthResponse(
      user: userResponse,
      accessToken: tokenPair.accessToken,
      expiresAt: tokenPair.accessTokenExpiresAt,
      refreshToken: tokenPair.refreshToken,
      refreshExpiresAt: tokenPair.refreshTokenExpiresAt
    )
        return APIResponse.success(response, message: "Signup successful")
    }
}

private func mapSuperbaseSignupError(_ error: any Error) -> Abort? {
    if let authError = error as? AuthError {
        if case let .api(message, errorCode, _, _) = authError,
           errorCode == .userAlreadyExists || errorCode == .emailExists {
            return Abort(.conflict, reason: message)
        }
    }

    let description = error.localizedDescription.lowercased()
    if description.contains("already registered") || description.contains("already exists") {
        return Abort(.conflict, reason: "User already exists in Superbase.")
    }

    return nil
}
