import Foundation

private struct LegacyStoredLimit: Decodable {
    private enum CodingKeys: String, CodingKey {
        case name
        case amount = "budget"
        case createdAt = "date"
        case categoryTitle
    }

    let name: String
    let amount: Int
    let createdAt: Date
    let categoryTitle: String?
}

private struct LegacyLimitReadResult {
    let limits: [[String: Any]]
    let error: String?
}

@objc class MigrationHelper: NSObject {
    private static let prepareLock = NSLock()

    @objc static func prepareCoreDataDatabase() -> [String: Any] {
        prepareLock.lock()
        defer { prepareLock.unlock() }

        let fm = FileManager.default
        let limitResult = readLegacyLimits()
        var response: [String: Any] = [
            "coreDataPresent": false,
            "copied": false,
            "limits": limitResult.limits
        ]
        if let limitsError = limitResult.error {
            response["limitsError"] = limitsError
        }

        guard
            let documents = fm.urls(for: .documentDirectory, in: .userDomainMask).last,
            let library = fm.urls(for: .libraryDirectory, in: .userDomainMask).first
        else {
            return response
        }

        let capDb = library.appendingPathComponent("CapacitorDatabase", isDirectory: true)
        let srcBase = documents.appendingPathComponent("D_in_Plus.sqlite")
        // @capacitor-community/sqlite opens "<databaseName>SQLite.db" on iOS.
        let dstBase = capDb.appendingPathComponent("legacy_coredata_dbSQLite.db")

        guard fm.fileExists(atPath: srcBase.path) else {
            return response
        }

        do {
            try fm.createDirectory(at: capDb, withIntermediateDirectories: true)

            let suffixes = ["", "-wal", "-shm"]
            let sourceSuffixes = suffixes.filter { suffix in
                fm.fileExists(atPath: srcBase.path + suffix)
            }
            let destinationIsComplete = sourceSuffixes.allSatisfy { suffix in
                fm.fileExists(atPath: dstBase.path + suffix)
            }
            let hasStaleDestinationSidecar = suffixes.contains { suffix in
                !fm.fileExists(atPath: srcBase.path + suffix)
                    && fm.fileExists(atPath: dstBase.path + suffix)
            }
            let copied = !(destinationIsComplete && !hasStaleDestinationSidecar)

            if copied {
                let tempBase = capDb.appendingPathComponent("legacy_coredata_db-\(UUID().uuidString).tmp")
                var tempFiles: [URL] = []

                do {
                    for suffix in sourceSuffixes {
                        let src = URL(fileURLWithPath: srcBase.path + suffix)
                        let temp = URL(fileURLWithPath: tempBase.path + suffix)
                        try fm.copyItem(at: src, to: temp)
                        tempFiles.append(temp)
                    }

                    for suffix in suffixes {
                        let dst = URL(fileURLWithPath: dstBase.path + suffix)
                        if fm.fileExists(atPath: dst.path) {
                            try fm.removeItem(at: dst)
                        }
                    }

                    for suffix in sourceSuffixes {
                        let temp = URL(fileURLWithPath: tempBase.path + suffix)
                        let dst = URL(fileURLWithPath: dstBase.path + suffix)
                        try fm.moveItem(at: temp, to: dst)
                    }
                } catch {
                    for temp in tempFiles where fm.fileExists(atPath: temp.path) {
                        try? fm.removeItem(at: temp)
                    }
                    throw error
                }
            }

            response["coreDataPresent"] = true
            response["copied"] = copied
            return response
        } catch {
            response["coreDataPresent"] = true
            response["copied"] = false
            response["error"] = error.localizedDescription
            return response
        }
    }

    private static func readLegacyLimits() -> LegacyLimitReadResult {
        guard let storedValue = UserDefaults.standard.object(forKey: "limits") else {
            return LegacyLimitReadResult(limits: [], error: nil)
        }

        if let data = storedValue as? Data {
            do {
                let decoded = try JSONDecoder().decode([LegacyStoredLimit].self, from: data)
                return LegacyLimitReadResult(
                    limits: decoded.map { serializeLimit($0) },
                    error: nil
                )
            } catch {
                return LegacyLimitReadResult(limits: [], error: error.localizedDescription)
            }
        }

        if let dictionaries = storedValue as? [NSDictionary] {
            return LegacyLimitReadResult(
                limits: dictionaries.compactMap { serializeLegacyDictionaryLimit($0) },
                error: nil
            )
        }

        if let dictionaries = storedValue as? [[String: Any]] {
            return LegacyLimitReadResult(
                limits: dictionaries.compactMap { serializeLegacyDictionaryLimit($0 as NSDictionary) },
                error: nil
            )
        }

        return LegacyLimitReadResult(limits: [], error: "Unsupported limits payload")
    }

    private static func serializeLimit(_ limit: LegacyStoredLimit) -> [String: Any] {
        return serializeLimit(
            name: limit.name,
            amount: limit.amount,
            date: limit.createdAt,
            categoryTitle: limit.categoryTitle ?? limit.name
        )
    }

    private static func serializeLegacyDictionaryLimit(_ dictionary: NSDictionary) -> [String: Any]? {
        guard
            let name = dictionary["name"] as? String,
            let budget = dictionary["budget"] as? NSNumber,
            let date = dictionary["date"] as? Date
        else {
            return nil
        }

        return serializeLimit(
            name: name,
            amount: budget.intValue,
            date: date,
            categoryTitle: dictionary["categoryTitle"] as? String ?? name
        )
    }

    private static func serializeLimit(
        name: String,
        amount: Int,
        date: Date,
        categoryTitle: String
    ) -> [String: Any] {
        return [
            "name": name,
            "amount": amount,
            "createdAt": Int((date.timeIntervalSince1970 * 1000).rounded()),
            "categoryTitle": categoryTitle
        ]
    }
}
