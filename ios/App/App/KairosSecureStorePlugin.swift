import Capacitor
import CryptoKit
import Foundation
import Security
import SQLite3

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private final class KairosDatabase {
    private var database: OpaquePointer?
    private let queue = DispatchQueue(label: "app.kairos.guardian.secure-store")
    private let service = "app.kairos.guardian"
    private let encryptionAccount = "local-store-encryption-key"

    init() throws {
        let manager = FileManager.default
        let root = try manager.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = root.appendingPathComponent("Kairos", isDirectory: true)
        try manager.createDirectory(at: directory, withIntermediateDirectories: true)
        try manager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
        let path = directory.appendingPathComponent("kairos.sqlite").path
        guard sqlite3_open_v2(
            path,
            &database,
            SQLITE_OPEN_CREATE | SQLITE_OPEN_READWRITE | SQLITE_OPEN_FULLMUTEX,
            nil
        ) == SQLITE_OK else {
            throw storeError("Unable to open the local store.")
        }
        sqlite3_busy_timeout(database, 2_000)
        try execute("pragma journal_mode=WAL")
        try execute("pragma foreign_keys=on")
        try execute("""
            create table if not exists snapshots(
              key text primary key,
              payload blob not null,
              updated_at real not null
            )
            """)
        try execute("""
            create table if not exists pending_operations(
              id text primary key,
              payload blob not null,
              status text not null check(status in('pending','syncing','needs_review')),
              created_at real not null
            )
            """)
        try execute("""
            create table if not exists assistant_history(
              id text primary key,
              payload blob not null,
              created_at real not null,
              expires_at real not null
            )
            """)
        try execute("create index if not exists assistant_history_expiry_idx on assistant_history(expires_at)")
        try manager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: path
        )
    }

    deinit { sqlite3_close(database) }

    func readSnapshot(key: String) throws -> String? {
        try queue.sync {
            let statement = try prepare("select payload from snapshots where key=?")
            defer { sqlite3_finalize(statement) }
            bind(key, at: 1, to: statement)
            guard sqlite3_step(statement) == SQLITE_ROW else { return nil }
            return stringBlob(statement, column: 0)
        }
    }

    func writeSnapshot(key: String, payload: String) throws {
        try queue.sync {
            let statement = try prepare("""
                insert into snapshots(key,payload,updated_at) values(?,?,?)
                on conflict(key) do update set payload=excluded.payload,updated_at=excluded.updated_at
                """)
            defer { sqlite3_finalize(statement) }
            bind(key, at: 1, to: statement)
            bind(Data(payload.utf8), at: 2, to: statement)
            sqlite3_bind_double(statement, 3, Date().timeIntervalSince1970)
            try step(statement)
        }
    }

    func queueOperation(id: String, payload: String) throws {
        try queue.sync {
            let encrypted = try encrypt(Data(payload.utf8))
            let statement = try prepare("""
                insert into pending_operations(id,payload,status,created_at)
                values(?,?,'pending',?)
                on conflict(id) do nothing
                """)
            defer { sqlite3_finalize(statement) }
            bind(id, at: 1, to: statement)
            bind(encrypted, at: 2, to: statement)
            sqlite3_bind_double(statement, 3, Date().timeIntervalSince1970)
            try step(statement)
        }
    }

    func operations() throws -> [[String: Any]] {
        try queue.sync {
            let statement = try prepare("""
                select id,payload,status,created_at
                from pending_operations
                order by created_at asc
                """)
            defer { sqlite3_finalize(statement) }
            var rows = [[String: Any]]()
            while sqlite3_step(statement) == SQLITE_ROW {
                guard let encrypted = dataBlob(statement, column: 1),
                      let payload = String(data: try decrypt(encrypted), encoding: .utf8) else {
                    continue
                }
                rows.append([
                    "id": string(statement, column: 0),
                    "payload": payload,
                    "status": string(statement, column: 2),
                    "createdAt": sqlite3_column_double(statement, 3)
                ])
            }
            return rows
        }
    }

    func setOperationStatus(id: String, status: String, remove: Bool) throws {
        try queue.sync {
            let statement = try prepare(
                remove
                    ? "delete from pending_operations where id=?"
                    : "update pending_operations set status=? where id=?"
            )
            defer { sqlite3_finalize(statement) }
            if remove {
                bind(id, at: 1, to: statement)
            } else {
                bind(status, at: 1, to: statement)
                bind(id, at: 2, to: statement)
            }
            try step(statement)
        }
    }

    func appendHistory(id: String, payload: String, expiresAt: Date) throws {
        try queue.sync {
            try purgeExpiredHistory()
            let statement = try prepare("""
                insert into assistant_history(id,payload,created_at,expires_at)
                values(?,?,?,?)
                on conflict(id) do update set payload=excluded.payload,expires_at=excluded.expires_at
                """)
            defer { sqlite3_finalize(statement) }
            bind(id, at: 1, to: statement)
            bind(try encrypt(Data(payload.utf8)), at: 2, to: statement)
            sqlite3_bind_double(statement, 3, Date().timeIntervalSince1970)
            sqlite3_bind_double(statement, 4, expiresAt.timeIntervalSince1970)
            try step(statement)
        }
    }

    func history() throws -> [[String: Any]] {
        try queue.sync {
            try purgeExpiredHistory()
            let statement = try prepare("""
                select id,payload,created_at
                from assistant_history
                order by created_at asc
                limit 100
                """)
            defer { sqlite3_finalize(statement) }
            var rows = [[String: Any]]()
            while sqlite3_step(statement) == SQLITE_ROW {
                guard let encrypted = dataBlob(statement, column: 1),
                      let payload = String(data: try decrypt(encrypted), encoding: .utf8) else {
                    continue
                }
                rows.append([
                    "id": string(statement, column: 0),
                    "payload": payload,
                    "createdAt": sqlite3_column_double(statement, 2)
                ])
            }
            return rows
        }
    }

    func clearHistory() throws {
        try queue.sync { try execute("delete from assistant_history") }
    }

    func clearAll() throws {
        try queue.sync {
            try execute("begin immediate")
            do {
                try execute("delete from snapshots")
                try execute("delete from pending_operations")
                try execute("delete from assistant_history")
                try execute("commit")
            } catch {
                try? execute("rollback")
                throw error
            }
        }
    }

    private func purgeExpiredHistory() throws {
        let statement = try prepare("delete from assistant_history where expires_at<=?")
        defer { sqlite3_finalize(statement) }
        sqlite3_bind_double(statement, 1, Date().timeIntervalSince1970)
        try step(statement)
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(database, sql, nil, nil, nil) == SQLITE_OK else {
            throw storeError("Local database operation failed.")
        }
    }

    private func prepare(_ sql: String) throws -> OpaquePointer {
        var statement: OpaquePointer?
        guard sqlite3_prepare_v2(database, sql, -1, &statement, nil) == SQLITE_OK,
              let statement else {
            throw storeError("Unable to prepare a local database operation.")
        }
        return statement
    }

    private func step(_ statement: OpaquePointer) throws {
        guard sqlite3_step(statement) == SQLITE_DONE else {
            throw storeError("Unable to save local data.")
        }
    }

    private func bind(_ value: String, at index: Int32, to statement: OpaquePointer) {
        sqlite3_bind_text(statement, index, value, -1, sqliteTransient)
    }

    private func bind(_ value: Data, at index: Int32, to statement: OpaquePointer) {
        _ = value.withUnsafeBytes { bytes in
            sqlite3_bind_blob(statement, index, bytes.baseAddress, Int32(value.count), sqliteTransient)
        }
    }

    private func string(_ statement: OpaquePointer, column: Int32) -> String {
        guard let value = sqlite3_column_text(statement, column) else { return "" }
        return String(cString: value)
    }

    private func dataBlob(_ statement: OpaquePointer, column: Int32) -> Data? {
        guard let bytes = sqlite3_column_blob(statement, column) else { return nil }
        return Data(bytes: bytes, count: Int(sqlite3_column_bytes(statement, column)))
    }

    private func stringBlob(_ statement: OpaquePointer, column: Int32) -> String? {
        guard let data = dataBlob(statement, column: column) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private func encryptionKey() throws -> SymmetricKey {
        if let data = secureValue(account: encryptionAccount) {
            return SymmetricKey(data: data)
        }
        var bytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes) == errSecSuccess else {
            throw storeError("Unable to create a local encryption key.")
        }
        let data = Data(bytes)
        try setSecureValue(account: encryptionAccount, data: data)
        return SymmetricKey(data: data)
    }

    private func encrypt(_ data: Data) throws -> Data {
        let box = try AES.GCM.seal(data, using: encryptionKey())
        guard let combined = box.combined else {
            throw storeError("Unable to encrypt local data.")
        }
        return combined
    }

    private func decrypt(_ data: Data) throws -> Data {
        try AES.GCM.open(AES.GCM.SealedBox(combined: data), using: encryptionKey())
    }

    func setSecureValue(account: String, data: Data) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
        var value = query
        value[kSecValueData as String] = data
        value[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        guard SecItemAdd(value as CFDictionary, nil) == errSecSuccess else {
            throw storeError("Unable to protect secure data.")
        }
    }

    func secureValue(account: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess else {
            return nil
        }
        return result as? Data
    }

    func deleteSecureValue(account: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }

    private func storeError(_ message: String) -> NSError {
        NSError(domain: "KairosSecureStore", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

@objc(KairosSecureStorePlugin)
final class KairosSecureStorePlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "KairosSecureStorePlugin"
    let jsName = "KairosSecureStore"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "readSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "queueOperation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingOperations", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setOperationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appendHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "history", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearHistory", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSecureValue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSecureValue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteSecureValue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAll", returnType: CAPPluginReturnPromise)
    ]

    private var store: KairosDatabase?

    @objc override func load() {
        store = try? KairosDatabase()
    }

    @objc func readSnapshot(_ call: CAPPluginCall) {
        perform(call) { store in
            ["payload": try store.readSnapshot(key: call.getString("key") ?? "bootstrap") as Any]
        }
    }

    @objc func writeSnapshot(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let payload = call.getString("payload") else { throw inputError() }
            try store.writeSnapshot(key: call.getString("key") ?? "bootstrap", payload: payload)
            return [:]
        }
    }

    @objc func queueOperation(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let id = call.getString("id"), let payload = call.getString("payload") else {
                throw inputError()
            }
            try store.queueOperation(id: id, payload: payload)
            return [:]
        }
    }

    @objc func pendingOperations(_ call: CAPPluginCall) {
        perform(call) { store in ["operations": try store.operations()] }
    }

    @objc func setOperationStatus(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let id = call.getString("id") else { throw inputError() }
            let status = call.getString("status") ?? "pending"
            guard ["pending", "syncing", "needs_review"].contains(status) else {
                throw inputError()
            }
            try store.setOperationStatus(id: id, status: status, remove: call.getBool("remove") ?? false)
            return [:]
        }
    }

    @objc func appendHistory(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let id = call.getString("id"), let payload = call.getString("payload") else {
                throw inputError()
            }
            let expiresAt = Date(timeIntervalSince1970: call.getDouble("expiresAt") ?? Date().addingTimeInterval(7 * 86_400).timeIntervalSince1970)
            try store.appendHistory(id: id, payload: payload, expiresAt: expiresAt)
            return [:]
        }
    }

    @objc func history(_ call: CAPPluginCall) {
        perform(call) { store in ["entries": try store.history()] }
    }

    @objc func clearHistory(_ call: CAPPluginCall) {
        perform(call) { store in
            try store.clearHistory()
            return [:]
        }
    }

    @objc func setSecureValue(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let key = call.getString("key"), let value = call.getString("value") else {
                throw inputError()
            }
            try store.setSecureValue(account: key, data: Data(value.utf8))
            return [:]
        }
    }

    @objc func getSecureValue(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let key = call.getString("key") else { throw inputError() }
            let value = store.secureValue(account: key).flatMap { String(data: $0, encoding: .utf8) }
            return ["value": value as Any]
        }
    }

    @objc func deleteSecureValue(_ call: CAPPluginCall) {
        perform(call) { store in
            guard let key = call.getString("key") else { throw inputError() }
            store.deleteSecureValue(account: key)
            return [:]
        }
    }

    @objc func clearAll(_ call: CAPPluginCall) {
        perform(call) { store in
            try store.clearAll()
            store.deleteSecureValue(account: "auth-refresh-token")
            return [:]
        }
    }

    private func perform(_ call: CAPPluginCall, operation: @escaping (KairosDatabase) throws -> [String: Any]) {
        guard let store else {
            call.reject("The secure local store is unavailable.")
            return
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do {
                let value = try operation(store)
                DispatchQueue.main.async { call.resolve(value) }
            } catch {
                DispatchQueue.main.async { call.reject(error.localizedDescription) }
            }
        }
    }
}

private func inputError() -> NSError {
    NSError(domain: "KairosSecureStore", code: 2, userInfo: [NSLocalizedDescriptionKey: "Local store input is invalid."])
}
