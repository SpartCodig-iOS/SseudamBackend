import NIOSSL
import Fluent
import FluentPostgresDriver
import PostgresNIO
import Vapor
import JWT
import Foundation

// configures your application
public func configure(_ app: Application) async throws {
  // Use Render's assigned port if available and serve static files/CORS
  app.http.server.configuration.port = Environment.get("PORT").flatMap(Int.init) ?? 8080

  app.middleware.use(FileMiddleware(publicDirectory: app.directory.publicDirectory))

  let corsConfiguration = CORSMiddleware.Configuration(
    allowedOrigin: .all,
    allowedMethods: [.GET, .POST, .PUT, .PATCH, .DELETE, .OPTIONS],
    allowedHeaders: [
      .accept,
      .authorization,
      .contentType,
      .origin,
      HTTPHeaders.Name("X-Requested-With")
    ]
  )
  app.middleware.use(CORSMiddleware(configuration: corsConfiguration))

  // Configure JWT
  if app.environment != .testing {
    let jwtKeyString = Environment.get("JWT_SECRET") ?? "secret"
    app.jwt.signers.use(.hs256(key: jwtKeyString))
  }

  let dbURL = Environment.get("SUPERBASE_DB_URL")
  ?? Environment.get("SUPABASE_DB_URL")
  ?? Environment.get("DATABASE_URL")

  let databaseConfig: SQLPostgresConfiguration
  if let urlString = dbURL, let parsed = try parseDatabaseURL(urlString, environment: app.environment) {
    databaseConfig = parsed
  } else {
    let manualHost = Environment.get("DATABASE_HOST") ?? "localhost"
    let manualRequireTLS = overrideTLSRequirement() ?? needsTLS(for: manualHost, environment: app.environment)
    let manualTLS = try tlsMode(
      for: manualHost,
      environment: app.environment,
      requireTLS: manualRequireTLS,
      rootCertPath: Environment.get("PGSSLROOTCERT")
    )
    databaseConfig = SQLPostgresConfiguration(
      hostname: manualHost,
      port: Environment.get("DATABASE_PORT").flatMap(Int.init(_:)) ?? SQLPostgresConfiguration.ianaPortNumber,
      username: Environment.get("DATABASE_USERNAME") ?? "vapor_username",
      password: Environment.get("DATABASE_PASSWORD") ?? "vapor_password",
      database: Environment.get("DATABASE_NAME") ?? "vapor_database",
      tls: manualTLS
    )
  }

  app.databases.use(
    .postgres(
      configuration: databaseConfig,
      encodingContext: .default,
      decodingContext: .default
    ),
    as: .psql
  )

  try app.configureSuperbase()

  // Add migrations
  app.migrations.add(CreateUser())
  app.migrations.add(AddUsernameToUser())

  // register routes
  try routes(app)
}

private func overrideTLSRequirement() -> Bool? {
  guard let raw = Environment.get("DATABASE_REQUIRE_TLS")?.lowercased() else { return nil }
  if ["1", "true", "yes", "y", "on"].contains(raw) { return true }
  if ["0", "false", "no", "n", "off"].contains(raw) { return false }
  return nil
}

private func needsTLS(for host: String, environment: Environment) -> Bool {
  if let override = overrideTLSRequirement() {
    return override
  }

  let localHosts = ["localhost", "127.0.0.1", "::1", "db"]
  if localHosts.contains(host.lowercased()) {
    return false
  }

  if host.contains("supabase.co") || host.contains("supabase.com") || host.contains("render.com") {
    return true
  }

  return environment == .production
}

private func makeTLSContext(for host: String, rootCertPath: String?) throws -> NIOSSLContext {
  var tls = TLSConfiguration.makeClientConfiguration()
  tls.applicationProtocols = ["postgres"]

  if let rootCertPath,
     FileManager.default.fileExists(atPath: rootCertPath) {
    let certificates = try NIOSSLCertificate.fromPEMFile(rootCertPath)
    tls.trustRoots = .certificates(certificates)
    tls.certificateVerification = .fullVerification
  } else if host.contains("supabase.co") || host.contains("supabase.com") {
    // RDS CA 경로가 없는 경우 Supabase 연결이 실패하지 않도록 임시로 검증을 완화한다.
    tls.certificateVerification = .none
  } else {
    // 기타 호스트에 대해서도 SSL 검증을 완화하여 연결 문제 방지
    tls.certificateVerification = .none
  }

  return try NIOSSLContext(configuration: tls)
}

private func tlsMode(
  for host: String,
  environment: Environment,
  requireTLS: Bool,
  rootCertPath: String?
) throws -> PostgresConnection.Configuration.TLS {
  if requireTLS {
    return .require(try makeTLSContext(for: host, rootCertPath: rootCertPath))
  }
  return .disable
}

private func parseDatabaseURL(_ urlString: String, environment: Environment) throws -> SQLPostgresConfiguration? {
  guard let components = URLComponents(string: urlString),
        let host = components.host else {
    return nil
  }

  let username = components.user ?? Environment.get("DATABASE_USERNAME") ?? "postgres"
  let password = components.password ?? Environment.get("DATABASE_PASSWORD") ?? ""
  let databaseName = components.path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
  let resolvedDatabase = databaseName.isEmpty
    ? (Environment.get("DATABASE_NAME") ?? "postgres")
    : databaseName

  let queryItems = components.queryItems ?? []
  let sslMode = queryItems.first { $0.name.lowercased() == "sslmode" }?.value?.lowercased()
  let rootCertQuery = queryItems.first { $0.name.lowercased() == "sslrootcert" }?.value
    ?? Environment.get("PGSSLROOTCERT")

  let defaultRequireTLS = needsTLS(for: host, environment: environment)
  let requireTLS: Bool
  switch sslMode {
  case "disable":
    requireTLS = false
  case "allow", "prefer":
    requireTLS = defaultRequireTLS
  case "require", "verify-full", "verify-ca":
    requireTLS = true
  default:
    requireTLS = defaultRequireTLS
  }

  let tls = try tlsMode(
    for: host,
    environment: environment,
    requireTLS: requireTLS,
    rootCertPath: rootCertQuery
  )

  return SQLPostgresConfiguration(
    hostname: host,
    port: components.port ?? SQLPostgresConfiguration.ianaPortNumber,
    username: username,
    password: password,
    database: resolvedDatabase,
    tls: tls
  )
}
