import XCTest
import Capacitor
import RealmSwift
@testable import App

// MARK: - Helpers

private func inMemoryRealm(_ id: String = #function) throws -> Realm {
  try Realm(configuration: Realm.Configuration(inMemoryIdentifier: id))
}

// MARK: - Tests

final class MigrationSetupPluginTests: XCTestCase {

  // MARK: emptyPayload

  func testEmptyPayload_allArraysEmpty() {
    let result = MigrationSetupPlugin.emptyPayload()
    XCTAssertEqual((result["accounts"] as? [[String: Any]])?.count, 0)
    XCTAssertEqual((result["balances"] as? [[String: Any]])?.count, 0)
    XCTAssertEqual((result["categories"] as? [[String: Any]])?.count, 0)
    XCTAssertEqual((result["savingGoals"] as? [[String: Any]])?.count, 0)
    XCTAssertEqual((result["recurringBalances"] as? [[String: Any]])?.count, 0)
    XCTAssertEqual((result["templates"] as? [[String: Any]])?.count, 0)
  }

  // MARK: Account serialisation

  func testSerialize_accountFields() throws {
    let realm = try inMemoryRealm()

    let category = RealmCategory()
    category.id = 10
    category.name = "Food"

    let account = RealmAccount()
    account.id = 1
    account.name = "Savings"
    account.initials = "SA"
    account.role = "owner"
    account.onlineId = 99

    try realm.write {
      realm.add(category)
      realm.add(account)
      account.realmCategories.append(category)
    }

    let result = MigrationSetupPlugin.serialize(
      accounts: Array(realm.objects(RealmAccount.self).freeze()),
      balances: [], categories: [], savingGoals: [], recurringBalances: [], templates: []
    )

    let accounts = result["accounts"] as? [[String: Any]]
    XCTAssertEqual(accounts?.count, 1)
    let accountResult = accounts!.first!
    XCTAssertEqual(accountResult["legacyId"] as? Int, 1)
    XCTAssertEqual(accountResult["name"] as? String, "Savings")
    XCTAssertEqual(accountResult["initials"] as? String, "SA")
    XCTAssertEqual(accountResult["role"] as? String, "owner")
    XCTAssertEqual(accountResult["onlineId"] as? Int, 99)
    XCTAssertEqual(accountResult["legacySource"] as? String, "realm")
    XCTAssertEqual(accountResult["categoryLegacyIds"] as? [Int], [10])
  }

  func testSerialize_account_emptyRoleAndNilOnlineId_omitted() throws {
    let realm = try inMemoryRealm()
    let account = RealmAccount()
    account.id = 2
    account.name = "Main"
    account.initials = "M"
    try realm.write { realm.add(account) }

    let result = MigrationSetupPlugin.serialize(
      accounts: Array(realm.objects(RealmAccount.self).freeze()),
      balances: [], categories: [], savingGoals: [], recurringBalances: [], templates: []
    )

    let accountResult = (result["accounts"] as! [[String: Any]]).first!
    XCTAssertNil(accountResult["role"])
    XCTAssertNil(accountResult["onlineId"])
  }

  func testSerialize_account_emptyInitials_stillPresent() throws {
    let realm = try inMemoryRealm()
    let account = RealmAccount()
    account.id = 3
    account.name = "Empty Initials"
    account.initials = ""
    try realm.write { realm.add(account) }

    let result = MigrationSetupPlugin.serialize(
      accounts: Array(realm.objects(RealmAccount.self).freeze()),
      balances: [], categories: [], savingGoals: [], recurringBalances: [], templates: []
    )

    let accountResult = (result["accounts"] as! [[String: Any]]).first!
    XCTAssertEqual(accountResult["initials"] as? String, "")
  }

  // MARK: Balance serialisation

  func testSerialize_balanceFields() throws {
    let realm = try inMemoryRealm()

    let category = RealmCategory()
    category.id = 10
    category.name = "Food"

    let account = RealmAccount()
    account.id = 1
    account.name = "Main"
    account.initials = "M"

    let goal = RealmSavingGoal()
    goal.id = 20
    goal.title = "Holiday"
    goal.dueDate = Date(timeIntervalSince1970: 1_800_000_000)

    let balance = RealmBalance()
    balance.id = 30
    balance.amount = 1500
    balance.date = Date(timeIntervalSince1970: 1_700_000_000)
    balance.title = "Groceries"
    balance.realmCategory = category
    balance.onlineId = 300

    try realm.write {
      realm.add(category)
      realm.add(account)
      realm.add(goal)
      realm.add(balance)
      account.realmBalances.append(balance)
      goal.realmBalances.append(balance)
    }

    let result = MigrationSetupPlugin.serialize(
      accounts: [], balances: Array(realm.objects(RealmBalance.self).freeze()),
      categories: [], savingGoals: [], recurringBalances: [], templates: []
    )

    let balanceResult = (result["balances"] as! [[String: Any]]).first!
    XCTAssertEqual(balanceResult["legacyId"] as? Int, 30)
    XCTAssertEqual(balanceResult["amount"] as? Int, 1500)
    XCTAssertEqual(balanceResult["title"] as? String, "Groceries")
    XCTAssertEqual(balanceResult["categoryLegacyId"] as? Int, 10)
    XCTAssertEqual(balanceResult["accountLegacyId"] as? Int, 1)
    XCTAssertEqual(balanceResult["savingGoalLegacyId"] as? Int, 20)
    XCTAssertEqual(balanceResult["onlineId"] as? Int, 300)
    XCTAssertEqual(balanceResult["legacySource"] as? String, "realm")
    XCTAssertEqual((balanceResult["date"] as? Double) ?? 0, 1_700_000_000.0 * 1000, accuracy: 1)
  }

  // MARK: Category serialisation

  func testSerialize_categoryFields() throws {
    let realm = try inMemoryRealm()
    let category = RealmCategory()
    category.id = 11
    category.name = "Transport"
    category.balanceType = .expense
    category.icon = 14
    category.categoryDefault = .categoryDefault
    category.limit = 5000
    category.onlineId = 111
    try realm.write { realm.add(category) }

    let result = MigrationSetupPlugin.serialize(
      accounts: [], balances: [],
      categories: Array(realm.objects(RealmCategory.self).freeze()),
      savingGoals: [], recurringBalances: [], templates: []
    )

    let categoryResult = (result["categories"] as! [[String: Any]]).first!
    XCTAssertEqual(categoryResult["legacyId"] as? Int, 11)
    XCTAssertEqual(categoryResult["name"] as? String, "Transport")
    XCTAssertEqual(categoryResult["balanceType"] as? String, "expense")
    XCTAssertEqual(categoryResult["icon"] as? Int, 14)
    XCTAssertEqual(categoryResult["isDefault"] as? Bool, true)
    XCTAssertEqual(categoryResult["limit"] as? Int, 5000)
    XCTAssertEqual(categoryResult["onlineId"] as? Int, 111)
  }

  func testSerialize_category_noLimit_omitsLimitKey() throws {
    let realm = try inMemoryRealm()
    let category = RealmCategory()
    category.id = 12
    category.name = "Food"
    category.icon = 3
    try realm.write { realm.add(category) }

    let result = MigrationSetupPlugin.serialize(
      accounts: [], balances: [],
      categories: Array(realm.objects(RealmCategory.self).freeze()),
      savingGoals: [], recurringBalances: [], templates: []
    )

    let categoryResult = (result["categories"] as! [[String: Any]]).first!
    XCTAssertNil(categoryResult["limit"])
    XCTAssertEqual(categoryResult["isDefault"] as? Bool, false)
  }

  // MARK: Saving goal serialisation

  func testSerialize_savingGoalFields() throws {
    let realm = try inMemoryRealm()

    let account = RealmAccount()
    account.id = 1
    account.name = "Main"
    account.initials = "M"

    let category = RealmCategory()
    category.id = 10
    category.name = "Food"

    let goal = RealmSavingGoal()
    goal.id = 21
    goal.title = "Holiday"
    goal.amount = 200_000
    goal.dueDate = Date(timeIntervalSince1970: 1_800_000_000)
    goal.monthlyAmount = 10_000
    goal.realmCategory = category

    try realm.write {
      realm.add(account)
      realm.add(category)
      realm.add(goal)
      account.realmSavingGoals.append(goal)
    }

    let result = MigrationSetupPlugin.serialize(
      accounts: [], balances: [], categories: [],
      savingGoals: Array(realm.objects(RealmSavingGoal.self).freeze()),
      recurringBalances: [], templates: []
    )

    let goalResult = (result["savingGoals"] as! [[String: Any]]).first!
    XCTAssertEqual(goalResult["legacyId"] as? Int, 21)
    XCTAssertEqual(goalResult["name"] as? String, "Holiday")
    XCTAssertEqual(goalResult["targetAmount"] as? Int, 200_000)
    XCTAssertEqual(goalResult["monthlyAmount"] as? Int, 10_000)
    XCTAssertEqual(goalResult["categoryLegacyId"] as? Int, 10)
    XCTAssertEqual(goalResult["accountLegacyId"] as? Int, 1)
    XCTAssertEqual((goalResult["deadline"] as? Double) ?? 0, 1_800_000_000.0 * 1000, accuracy: 1)
  }

  // MARK: Recurring — accountId resolved via owning account list (§4.5)

  func testSerialize_recurring_accountIdResolvedFromOwningAccount() throws {
    let realm = try inMemoryRealm()

    let recurring = RealmRecurringBalance()
    recurring.id = 40
    recurring.title = "Rent"
    recurring.amount = 80_000
    recurring.date = Date(timeIntervalSince1970: 1_700_000_000)
    recurring.interval = 1

    let account = RealmAccount()
    account.id = 1
    account.name = "Main"
    account.initials = "M"

    try realm.write {
      realm.add(recurring)
      realm.add(account)
      account.realmRecurringBalances.append(recurring)
    }

    let result = MigrationSetupPlugin.serialize(
      accounts: Array(realm.objects(RealmAccount.self).freeze()),
      balances: [], categories: [], savingGoals: [],
      recurringBalances: Array(realm.objects(RealmRecurringBalance.self).freeze()),
      templates: []
    )

    let recurringResult = (result["recurringBalances"] as! [[String: Any]]).first!
    XCTAssertEqual(recurringResult["legacyId"] as? Int, 40)
    XCTAssertEqual(recurringResult["accountLegacyId"] as? Int, 1)
    XCTAssertEqual(recurringResult["interval"] as? Int, 1)
    XCTAssertEqual(recurringResult["legacySource"] as? String, "realm")
  }

  // MARK: Template — accountId resolved via owning account list (§4.6)

  func testSerialize_template_accountIdResolvedFromOwningAccount() throws {
    let realm = try inMemoryRealm()

    let template = RealmTemplate()
    template.id = 50
    template.title = "Coffee"
    template.amount = 350

    let account = RealmAccount()
    account.id = 1
    account.name = "Main"
    account.initials = "M"

    try realm.write {
      realm.add(template)
      realm.add(account)
      account.realmTemplates.append(template)
    }

    let result = MigrationSetupPlugin.serialize(
      accounts: Array(realm.objects(RealmAccount.self).freeze()),
      balances: [], categories: [], savingGoals: [], recurringBalances: [],
      templates: Array(realm.objects(RealmTemplate.self).freeze())
    )

    let templateResult = (result["templates"] as! [[String: Any]]).first!
    XCTAssertEqual(templateResult["legacyId"] as? Int, 50)
    XCTAssertEqual(templateResult["accountLegacyId"] as? Int, 1)
    XCTAssertEqual(templateResult["legacySource"] as? String, "realm")
  }

  // MARK: Orphans

  func testSerialize_recurring_noOwningAccount_omitsAccountLegacyId() throws {
    let realm = try inMemoryRealm()

    let recurring = RealmRecurringBalance()
    recurring.id = 41
    recurring.title = "Orphan"
    recurring.amount = 100
    recurring.interval = 1
    recurring.date = Date()

    try realm.write { realm.add(recurring) }

    let result = MigrationSetupPlugin.serialize(
      accounts: [],
      balances: [], categories: [], savingGoals: [],
      recurringBalances: Array(realm.objects(RealmRecurringBalance.self).freeze()),
      templates: []
    )

    let recurringResult = (result["recurringBalances"] as! [[String: Any]]).first!
    XCTAssertNil(recurringResult["accountLegacyId"])
    XCTAssertEqual(recurringResult["legacyId"] as? Int, 41)
  }

  func testSerialize_template_noOwningAccount_omitsAccountLegacyId() throws {
    let realm = try inMemoryRealm()

    let template = RealmTemplate()
    template.id = 51
    template.title = "Orphan Template"
    template.amount = 500

    try realm.write { realm.add(template) }

    let result = MigrationSetupPlugin.serialize(
      accounts: [],
      balances: [], categories: [], savingGoals: [], recurringBalances: [],
      templates: Array(realm.objects(RealmTemplate.self).freeze())
    )

    let templateResult = (result["templates"] as! [[String: Any]]).first!
    XCTAssertNil(templateResult["accountLegacyId"])
    XCTAssertEqual(templateResult["legacyId"] as? Int, 51)
  }
}

private enum PluginCallOutcome {
  case success([String: Any]?)
  case failure(CAPPluginCallError)
}

private func invokePluginCall(
  methodName: String,
  options: [String: Any],
  operation: (CAPPluginCall) -> Void
) -> PluginCallOutcome {
  var outcome: PluginCallOutcome?
  let call = CAPPluginCall(
    callbackId: UUID().uuidString,
    methodName: methodName,
    options: options,
    success: { (result: CAPPluginCallResult?, _: CAPPluginCall?) in
      outcome = .success(result?.data)
    },
    error: { (error: CAPPluginCallError?) in
      outcome = .failure(
        error ?? CAPPluginCallError(message: "Unknown plugin error", code: nil, error: nil, data: nil)
      )
    }
  )

  guard let call else {
    XCTFail("Failed to create plugin call")
    return .failure(CAPPluginCallError(message: "No plugin call", code: nil, error: nil, data: nil))
  }

  operation(call)

  guard let outcome else {
    XCTFail("Plugin call did not resolve or reject")
    return .failure(CAPPluginCallError(message: "No outcome", code: nil, error: nil, data: nil))
  }

  return outcome
}

final class PrivateKeyStorePluginTests: XCTestCase {
  func testSetGetRemoveRoundTripOnSimulatorKeychain() {
    let plugin = PrivateKeyStorePlugin()
    let service = "com.budget.accountkey.xctest.\(UUID().uuidString)"
    let value = "base64url-account-key"

    defer {
      _ = invokePluginCall(
        methodName: "remove",
        options: ["service": service],
        operation: plugin.remove
      )
    }

    switch invokePluginCall(
      methodName: "set",
      options: ["service": service, "value": value],
      operation: plugin.set
    ) {
    case .success:
      break
    case .failure(let error):
      XCTFail("set rejected: \(error.code ?? "no_code") \(error.message)")
    }

    switch invokePluginCall(
      methodName: "get",
      options: ["service": service],
      operation: plugin.get
    ) {
    case .success(let data):
      XCTAssertEqual(data?["value"] as? String, value)
    case .failure(let error):
      XCTFail("get rejected: \(error.code ?? "no_code") \(error.message)")
    }

    switch invokePluginCall(
      methodName: "remove",
      options: ["service": service],
      operation: plugin.remove
    ) {
    case .success:
      break
    case .failure(let error):
      XCTFail("remove rejected: \(error.code ?? "no_code") \(error.message)")
    }

    switch invokePluginCall(
      methodName: "get",
      options: ["service": service],
      operation: plugin.get
    ) {
    case .success:
      XCTFail("get should reject after remove")
    case .failure(let error):
      XCTAssertEqual(error.code, "ITEM_NOT_FOUND")
      XCTAssertEqual(error.message, "Item with given service does not exist")
    }
  }

  func testIsHardwareBackedReturnsTrue() {
    let plugin = PrivateKeyStorePlugin()

    switch invokePluginCall(
      methodName: "isHardwareBacked",
      options: [:],
      operation: plugin.isHardwareBacked
    ) {
    case .success(let data):
      XCTAssertEqual(data?["value"] as? Bool, true)
    case .failure(let error):
      XCTFail("isHardwareBacked rejected: \(error.code ?? "no_code") \(error.message)")
    }
  }
}
