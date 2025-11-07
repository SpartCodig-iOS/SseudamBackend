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
    let manualTLS = try tlsMode(for: manualHost, environment: app.environment)
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

private func needsTLS(for host: String, environment: Environment) -> Bool {
  if host.contains("supabase.co") || host.contains("render.com") {
    return true
  }
  return environment == .production
}

private func makeTLSContext(for host: String) throws -> NIOSSLContext {
  var tls = TLSConfiguration.makeClientConfiguration()
  tls.applicationProtocols = ["postgres"]

  // Supabase의 managed Postgres는 AWS RDS 인증서를 사용하며 체인이 자주 갱신된다.
  // Cloud Run의 ca-certificates에 아직 포함되지 않은 경우가 있어 인증서 검증을 건너뛰지 않으면 TLS가 실패한다.
  if host.contains("supabase.com") {
    tls.certificateVerification = .none
  }

  return try NIOSSLContext(configuration: tls)
}

private func tlsMode(for host: String, environment: Environment) throws -> PostgresConnection.Configuration.TLS {
  if needsTLS(for: host, environment: environment) {
    return .require(try makeTLSContext(for: host))
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

  let tls = try tlsMode(for: host, environment: environment)

  return SQLPostgresConfiguration(
    hostname: host,
    port: components.port ?? SQLPostgresConfiguration.ianaPortNumber,
    username: username,
    password: password,
    database: resolvedDatabase,
    tls: tls
  )
}
