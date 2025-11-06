import Foundation
import Supabase
import Vapor

private struct SuperbaseProfileInsert: Encodable {
    let id: UUID
    let email: String
    let name: String?
    let username: String
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case email
        case name
        case username
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

struct SuperbaseService {
    let client: SuperbaseClient
    let profileTable: String

    init(client: SuperbaseClient, profileTable: String) {
        self.client = client
        self.profileTable = profileTable
    }

    // MARK: - User Registration
    @discardableResult
    func signUp(email: String, password: String, metadata: [String: String]? = nil) async throws -> SuperbaseAuthResponse {
        // Use the admin API so we always talk to PostgREST with the service_role key (no user session side-effects).
        let userMetadata = metadata?.mapValues { AnyJSON.string($0) }
        let attributes = AdminUserAttributes(
            email: email,
            emailConfirm: true,
            password: password,
            userMetadata: userMetadata
        )

        let user = try await client.auth.admin.createUser(attributes: attributes)
        return .user(user)
    }

    // MARK: - User Login
    @discardableResult
    func signIn(email: String, password: String) async throws -> SuperbaseSession {
        try await client.auth.signIn(email: email, password: password)
    }

    // MARK: - Get User Info
    func getUser(token: String? = nil) async throws -> SuperbaseUser {
        try await client.auth.user(jwt: token)
    }

    // MARK: - Sync Profile
    func upsertProfile(
        userID: UUID,
        email: String,
        name: String?,
        username: String
    ) async throws {
        let timestamp = Date()
        let payload = SuperbaseProfileInsert(
            id: userID,
            email: email,
            name: name,
            username: username,
            createdAt: timestamp,
            updatedAt: timestamp
        )

        try await client
            .from(profileTable)
            .upsert(payload, onConflict: "id", returning: .minimal)
            .execute()
    }

    // MARK: - Delete Superbase User
    func deleteUser(id: UUID) async throws {
        try await client.auth.admin.deleteUser(id: id)
    }
}

// MARK: - Configuration
extension SuperbaseService {
    static func makeFromEnvironment(environment: Environment, logger: Logger) throws -> SuperbaseService {
        let urlString = Environment.get("SUPERBASE_URL") ?? Environment.get("SUPABASE_URL")
        let keyString = Environment.get("SUPERBASE_ANON_KEY") ?? Environment.get("SUPABASE_ANON_KEY")
        let profileTable = Environment.get("SUPERBASE_PROFILE_TABLE")
            ?? Environment.get("SUPABASE_PROFILE_TABLE")
            ?? "profiles"

        let resolvedURL = urlString.flatMap(URL.init(string:))

        if environment == .production {
            guard let supabaseURL = resolvedURL else {
                throw SuperbaseConfigurationError.missingEnvironmentVariable("SUPERBASE_URL")
            }
            guard let supabaseKey = keyString, !supabaseKey.isEmpty else {
                throw SuperbaseConfigurationError.missingEnvironmentVariable("SUPERBASE_ANON_KEY")
            }
            return SuperbaseService.makeService(url: supabaseURL, key: supabaseKey, profileTable: profileTable)
        }

        guard let supabaseURL = resolvedURL,
              let supabaseKey = keyString, !supabaseKey.isEmpty else {
            logger.warning("Superbase 환경 변수가 없어 플레이스홀더 클라이언트를 사용합니다. 실제 연동 시 .env에 값을 설정하세요.")
            return SuperbaseService.makePlaceholder(profileTable: profileTable)
        }

        return SuperbaseService.makeService(url: supabaseURL, key: supabaseKey, profileTable: profileTable)
    }

    static func makePlaceholder(profileTable: String) -> SuperbaseService {
        let placeholderURL = URL(string: "https://placeholder.superbase.co")!
        return SuperbaseService.makeService(url: placeholderURL, key: "placeholder-superbase-key", profileTable: profileTable)
    }

    private static func makeClient(url: URL, key: String) -> SuperbaseClient {
        let options = SuperbaseClientOptions(
            auth: .init(
                storage: InMemoryAuthLocalStorage.shared,
                emitLocalSessionAsInitialSession: true
            )
        )
        return SuperbaseClient(supabaseURL: url, supabaseKey: key, options: options)
    }

    private static func makeService(url: URL, key: String, profileTable: String) -> SuperbaseService {
        SuperbaseService(client: Self.makeClient(url: url, key: key), profileTable: profileTable)
    }
}

enum SuperbaseConfigurationError: Error, LocalizedError {
    case missingEnvironmentVariable(String)

    var errorDescription: String? {
        switch self {
        case .missingEnvironmentVariable(let key):
            return "환경 변수 \(key)이(가) 설정되지 않았습니다."
        }
    }
}

// MARK: - Service Registration
extension Application {
    private struct SuperbaseServiceKey: StorageKey {
        typealias Value = SuperbaseService
    }

    var superbase: SuperbaseService {
        get {
            guard let service = storage[SuperbaseServiceKey.self] else {
                fatalError("SuperbaseService가 구성되지 않았습니다. configureSuperbase(app:)을 호출하세요.")
            }
            return service
        }
        set {
            storage[SuperbaseServiceKey.self] = newValue
        }
    }

    func configureSuperbase() throws {
        storage[SuperbaseServiceKey.self] = try SuperbaseService.makeFromEnvironment(environment: environment, logger: logger)
    }
}

extension Request {
    var superbase: SuperbaseService {
        application.superbase
    }
}
