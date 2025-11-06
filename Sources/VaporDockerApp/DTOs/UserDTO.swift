import Vapor
import JWT

// MARK: - User Signup DTO
struct UserSignup: Content, Validatable {
  let email: String
  let password: String
  let name: String?

  static func validations(_ validations: inout Validations) {
    validations.add("email", as: String.self, is: .email)
    validations.add("password", as: String.self, is: .count(6...))
  }
}

// MARK: - User Login DTO
struct UserLogin: Content, Validatable {
  let identifier: String
  let password: String

  static func validations(_ validations: inout Validations) {
    validations.add("email", as: String.self, is: .count(1...))
    validations.add("password", as: String.self, is: !.empty)
  }

  enum CodingKeys: String, CodingKey {
    case identifier = "email"
    case password
  }
}

// MARK: - Authentication Response DTO
struct AuthResponse: Content {
  let user: UserResponse
  let accessToken: String
  let refreshToken: String
  var tokenType: String = "Bearer"
  let expiresAt: Date
  let refreshExpiresAt: Date

  init(
    user: UserResponse,
    accessToken: String,
    expiresAt: Date,
    refreshToken: String,
    refreshExpiresAt: Date
  ) {
    self.user = user
    self.accessToken = accessToken
    self.refreshToken = refreshToken
    self.expiresAt = expiresAt
    self.refreshExpiresAt = refreshExpiresAt
  }
}

struct RefreshTokenRequest: Content {
  let refreshToken: String
}

// MARK: - JWT Payload
struct UserPayload: JWTPayload {
  enum CodingKeys: String, CodingKey {
    case subject = "sub"
    case expiration = "exp"
    case email = "email"
    case name = "name"
  }

  var subject: SubjectClaim
  var expiration: ExpirationClaim
  var email: String
  var name: String?

  init(subject: String, expiration: Date, email: String, name: String?) {
    self.subject = SubjectClaim(value: subject)
    self.expiration = ExpirationClaim(value: expiration)
    self.email = email
    self.name = name
  }

  func verify(using signer: JWTSigner) throws {
    try self.expiration.verifyNotExpired()
  }
}

struct RefreshTokenPayload: JWTPayload {
  enum CodingKeys: String, CodingKey {
    case subject = "sub"
    case expiration = "exp"
    case tokenType = "typ"
  }

  var subject: SubjectClaim
  var expiration: ExpirationClaim
  var tokenType: String

  init(subject: String, expiration: Date, tokenType: String = "refresh") {
    self.subject = SubjectClaim(value: subject)
    self.expiration = ExpirationClaim(value: expiration)
    self.tokenType = tokenType
  }

  func verify(using signer: JWTSigner) throws {
    try expiration.verifyNotExpired()
    guard tokenType == "refresh" else {
      throw Abort(.unauthorized, reason: "Invalid refresh token")
    }
  }
}
