import Foundation
import Supabase

final class InMemoryAuthLocalStorage: AuthLocalStorage, @unchecked Sendable {
    static let shared = InMemoryAuthLocalStorage()

    private var storage: [String: Data] = [:]
    private let lock = NSLock()

    private init() {}

    func store(key: String, value: Data) throws {
        lock.lock()
        defer { lock.unlock() }
        storage[key] = value
    }

    func retrieve(key: String) throws -> Data? {
        lock.lock()
        defer { lock.unlock() }
        return storage[key]
    }

    func remove(key: String) throws {
        lock.lock()
        defer { lock.unlock() }
        storage.removeValue(forKey: key)
    }
}
