import Capacitor
import Foundation
import RealmSwift

// MARK: - Plugin

@objc(MigrationSetupPlugin)
public class MigrationSetupPlugin: CAPPlugin, CAPBridgedPlugin {

  public let identifier = "MigrationSetupPlugin"
  public let jsName = "MigrationSetupPlugin"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "prepareiOSDatabases", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "readRealmData", returnType: CAPPluginReturnPromise),
  ]

  // MARK: prepareiOSDatabases

  @objc func prepareiOSDatabases(_ call: CAPPluginCall) {
    call.resolve(MigrationHelper.prepareCoreDataDatabase())
  }

  // MARK: readRealmData

  @objc func readRealmData(_ call: CAPPluginCall) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        // 1. Locate the default Realm file
        guard let realmURL = Realm.Configuration.defaultConfiguration.fileURL else {
          call.reject("REALM_FILE_NOT_FOUND", "Realm database file not found")
          return
        }

        // 2. Realm file absent → user was on Core Data only, not an error
        guard FileManager.default.fileExists(atPath: realmURL.path) else {
          call.resolve(MigrationSetupPlugin.emptyPayload())
          return
        }

        // 3. Build configuration.
        // The legacy "Mein Budget" app (de.deutschland-im-plus.MeinBudget) opens
        // Realm without an encryption key — confirmed in RealmDatabase.swift:
        //   Realm.Configuration(schemaVersion: schemaVersion, deleteRealmIfMigrationNeeded: false)
        // No encryptionKey is ever set, so no Keychain lookup is needed.
        let config = Realm.Configuration(
          fileURL: realmURL,
          schemaVersion: 1,
          deleteRealmIfMigrationNeeded: false
        )

        // 4. Open Realm and freeze all results immediately (thread-safety)
        let realm = try Realm(configuration: config)

        let accounts   = Array(realm.objects(RealmAccount.self).freeze())
        let balances   = Array(realm.objects(RealmBalance.self).freeze())
        let categories = Array(realm.objects(RealmCategory.self).freeze())
        let goals      = Array(realm.objects(RealmSavingGoal.self).freeze())
        let recurring  = Array(realm.objects(RealmRecurringBalance.self).freeze())
        let templates  = Array(realm.objects(RealmTemplate.self).freeze())

        call.resolve(MigrationSetupPlugin.serialize(
          accounts: accounts,
          balances: balances,
          categories: categories,
          savingGoals: goals,
          recurringBalances: recurring,
          templates: templates
        ))

      } catch {
        call.reject("REALM_ERROR", error.localizedDescription)
      }
    }
  }

  // MARK: - Serialisation (static — callable from XCTest without a bridge)

  static func emptyPayload() -> [String: Any] {
    return [
      "accounts": [[String: Any]](),
      "balances": [[String: Any]](),
      "categories": [[String: Any]](),
      "savingGoals": [[String: Any]](),
      "recurringBalances": [[String: Any]](),
      "templates": [[String: Any]](),
    ]
  }

  /// Converts frozen Realm objects into Capacitor-bridge-safe [String: Any] dictionaries.
  /// All account-resolution for recurring/templates is done here by walking the
  /// owning RealmAccount's list relationships (per schema map §4.5, §4.6).
  static func serialize(
    accounts: [RealmAccount],
    balances: [RealmBalance],
    categories: [RealmCategory],
    savingGoals: [RealmSavingGoal],
    recurringBalances: [RealmRecurringBalance],
    templates: [RealmTemplate]
  ) -> [String: Any] {

    // ── Build lookup maps for account resolution ──────────────────────────
    // recurring: recurringId → accountId  (§4.5: "find the account where this
    //   item's id appears in its recurring list")
    var recurringToAccountId: [Int: Int] = [:]
    var templateToAccountId: [Int: Int] = [:]

    for account in accounts {
      for item in account.realmRecurringBalances {
        recurringToAccountId[item.id] = account.id
      }
      for item in account.realmTemplates {
        templateToAccountId[item.id] = account.id
      }
    }

    // ── Accounts ──────────────────────────────────────────────────────────
    let serializedAccounts: [[String: Any]] = accounts.map { obj in
      var d: [String: Any] = [
        "legacyId": obj.id,
        "name": obj.name,
        "initials": obj.initials,
        // Expose the account→category relationship so the TS layer can perform
        // the proper §4.7 limit derivation instead of the transaction heuristic.
        "categoryLegacyIds": Array(obj.realmCategories.map { $0.id }),
        "legacySource": "realm",
      ]
      if !obj.role.isEmpty    { d["role"]     = obj.role }
      if let v = obj.onlineId { d["onlineId"] = v }
      return d
    }

    // ── Balances (transactions) ───────────────────────────────────────────
    let serializedBalances: [[String: Any]] = balances.map { obj in
      var d: [String: Any] = [
        "legacyId": obj.id,
        "amount": obj.amount,
        "date": obj.date.timeIntervalSince1970 * 1000, // Unix ms — JS uses fromUnixMs()
        "title": obj.title,
        "legacySource": "realm",
      ]
      if let v = obj.realmCategory?.id           { d["categoryLegacyId"]   = v }
      if let v = obj.realmAccounts.first?.id     { d["accountLegacyId"]    = v }
      if let v = obj.realmSavingGoals.first?.id  { d["savingGoalLegacyId"] = v }
      if let v = obj.onlineId            { d["onlineId"]           = v }
      return d
    }

    // ── Categories ────────────────────────────────────────────────────────
    let serializedCategories: [[String: Any]] = categories.map { obj in
      var d: [String: Any] = [
        "legacyId": obj.id,
        "name": obj.name,
        "isDefault": obj.categoryDefault != nil,
        "icon": obj.icon,          // Int (non-optional, default 1) — always present, no if-let needed
        "balanceType": obj.balanceType == .income ? "income" : "expense",
        "legacySource": "realm",
      ]
      if let v = obj.limit    { d["limit"]       = v }
      if let v = obj.onlineId { d["onlineId"]    = v }
      return d
    }

    // ── Saving goals ──────────────────────────────────────────────────────
    let serializedSavingGoals: [[String: Any]] = savingGoals.map { obj in
      var d: [String: Any] = [
        "legacyId": obj.id,
        "name": obj.title,
        "targetAmount": obj.amount,
        "deadline": obj.dueDate.timeIntervalSince1970 * 1000,
        "legacySource": "realm",
      ]
      if let v = obj.realmCategory?.id      { d["categoryLegacyId"] = v }
      if let v = obj.realmAccounts.first?.id { d["accountLegacyId"]  = v }
      d["monthlyAmount"] = obj.monthlyAmount
      if let v = obj.onlineId               { d["onlineId"]         = v }
      return d
    }

    // ── Recurring balances ────────────────────────────────────────────────
    // accountId resolved via the owning RealmAccount's list (§4.5)
    let serializedRecurring: [[String: Any]] = recurringBalances.map { obj in
      var d: [String: Any] = [
        "legacyId": obj.id,
        "name": obj.title,
        "amount": obj.amount,
        "startDate": obj.date.timeIntervalSince1970 * 1000,
        "interval": obj.interval,
        "legacySource": "realm",
      ]
      if let v = obj.realmCategory?.id          { d["categoryLegacyId"] = v }
      if let v = recurringToAccountId[obj.id]   { d["accountLegacyId"]  = v }
      if let v = obj.onlineId                   { d["onlineId"]         = v }
      return d
    }

    // ── Templates ─────────────────────────────────────────────────────────
    // accountId resolved via the owning RealmAccount's list (§4.6)
    let serializedTemplates: [[String: Any]] = templates.map { obj in
      var d: [String: Any] = [
        "legacyId": obj.id,
        "name": obj.title,
        "amount": obj.amount,
        "legacySource": "realm",
      ]
      if let v = obj.realmCategory?.id        { d["categoryLegacyId"] = v }
      if let v = templateToAccountId[obj.id]  { d["accountLegacyId"]  = v }
      if let v = obj.onlineId                 { d["onlineId"]         = v }
      return d
    }

    return [
      "accounts":         serializedAccounts,
      "balances":         serializedBalances,
      "categories":       serializedCategories,
      "savingGoals":      serializedSavingGoals,
      "recurringBalances": serializedRecurring,
      "templates":        serializedTemplates,
    ]
  }
}
