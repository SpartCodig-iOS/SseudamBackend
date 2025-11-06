import Fluent
import Vapor

final class User: Model, Content {
  static let schema = "users"

  @ID(key: .id)
  var id: UUID?

  @Field(key: "email")
  var email: String

  @Field(key: "password_hash")
  var passwordHash: String

  @Field(key: "name")
  var name: String?

  @Field(key: "avatar_url")
  var avatarURL: String?

  @Field(key: "username")
  var username: String

  @Timestamp(key: "created_at", on: .create)
  var createdAt: Date?

  @Timestamp(key: "updated_at", on: .update)
  var updatedAt: Date?

  init() { }

  init(
    id: UUID? = nil,
    email: String,
    passwordHash: String,
    name: String? = nil,
    avatarURL: String? = nil,
    username: String
  ) {
    self.id = id
    self.email = email
    self.passwordHash = passwordHash
    self.name = name
    self.avatarURL = avatarURL
    self.username = username
  }
}

extension User: @unchecked Sendable {}

extension User: Authenticatable {}

// MARK: - User Response DTO
struct UserResponse: Content {
  let id: UUID
  let email: String
  let name: String?
  let avatarURL: String?
  let createdAt: Date?
  let username: String

  init(from user: User) throws {
    guard let id = user.id else {
      throw Abort(.internalServerError, reason: "User missing ID")
    }
    self.id = id
    self.email = user.email
    self.name = user.name
    self.avatarURL = user.avatarURL
    self.createdAt = user.createdAt
    self.username = user.username
  }
}

// MARK: - User Authentication Extensions
extension User {
  static func create(from userSignup: UserSignup, on database: any Database) async throws -> User {
    let hashedPassword = try Bcrypt.hash(userSignup.password)
    let normalizedEmail = userSignup.email.lowercased()
    let derivedUsername = normalizedEmail.split(separator: "@").first.map(String.init)?.lowercased() ?? normalizedEmail
    let user = User(
      email: normalizedEmail,
      passwordHash: hashedPassword,
      name: userSignup.name,
      username: derivedUsername
    )
    try await user.save(on: database)
    return user
  }

  func verify(password: String) throws -> Bool {
    try Bcrypt.verify(password, created: self.passwordHash)
  }
}
