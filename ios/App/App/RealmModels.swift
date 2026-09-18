import Foundation
import RealmSwift

enum RealmBalanceType: Int, PersistableEnum {
  case income = 0
  case expense = 1
}

enum RealmCategoryDefault: String, PersistableEnum {
  case categoryDefault = "DEFAULT"
  case transferDefault = "DEFAULT_TRANSFER"
}

class DatabaseObject: Object {
  @Persisted(primaryKey: true) var id: Int = 0
  @Persisted var onlineId: Int?
}

// MARK: - RealmAccount
// Source: Database/Realm/Objects/RealmAccount.swift in the legacy iOS app.

class RealmAccount: DatabaseObject {
  @Persisted var realmBalances = List<RealmBalance>()
  @Persisted var realmRecurringBalances = List<RealmRecurringBalance>()
  @Persisted var realmCategories = List<RealmCategory>()
  @Persisted var realmTemplates = List<RealmTemplate>()
  @Persisted var realmSavingGoals = List<RealmSavingGoal>()

  @Persisted var userId: Int = 0
  @Persisted var name: String = ""
  @Persisted var initials: String = ""
  @Persisted var accountColor: String = ""
  @Persisted var role: String = ""
}

// MARK: - RealmBalance (= Transaction)
// Source: Database/Realm/Objects/RealmBalance.swift.

class RealmBalance: DatabaseObject {
  @Persisted var realmCategory: RealmCategory?
  @Persisted(originProperty: "realmBalances") var realmAccounts: LinkingObjects<RealmAccount>
  @Persisted(originProperty: "realmBalances") var realmSavingGoals: LinkingObjects<RealmSavingGoal>

  @Persisted var title: String = ""
  @Persisted var amount: Int = 0
  @Persisted var date: Date = Date()
  @Persisted var iconId: Int = 0
  @Persisted var imagePath: String?
}

// MARK: - RealmCategory
// Source: Database/Realm/Objects/RealmCategory.swift.

class RealmCategory: DatabaseObject {
  @Persisted(originProperty: "realmCategories") var realmAccounts: LinkingObjects<RealmAccount>

  @Persisted var name: String = ""
  @Persisted var icon: Int = 1
  @Persisted var balanceType: RealmBalanceType = .expense
  @Persisted var active: Bool = true
  @Persisted var deletable: Bool = true
  @Persisted var limit: Int?
  @Persisted var limitDate: Date?
  @Persisted var limitName: String?
  @Persisted var categoryDefault: RealmCategoryDefault?
}

// MARK: - RealmSavingGoal
// Source: Database/Realm/Objects/RealmSavingGoal.swift.

class RealmSavingGoal: DatabaseObject {
  @Persisted(originProperty: "realmSavingGoals") var realmAccounts: LinkingObjects<RealmAccount>
  @Persisted var realmCategory: RealmCategory?
  @Persisted var realmBalances = List<RealmBalance>()

  @Persisted var monthlyAmount: Int = 0
  @Persisted var dueDate: Date = Date()
  @Persisted var title: String = ""
  @Persisted var amount: Int = 0
  @Persisted var date: Date = Date()
}

// MARK: - RealmRecurringBalance
// Source: Database/Realm/Objects/RealmRecurringBalance.swift.

class RealmRecurringBalance: DatabaseObject {
  @Persisted var realmCategory: RealmCategory?
  @Persisted(originProperty: "realmRecurringBalances") var realmAccounts: LinkingObjects<RealmAccount>

  @Persisted var title: String = ""
  @Persisted var amount: Int = 0
  @Persisted var date: Date = Date()
  @Persisted var startDate: Date = Date()
  @Persisted var iconId: Int = 0
  @Persisted var interval: Int = 1
  @Persisted var lastBooking: Date = Date()
}

// MARK: - RealmTemplate
// Source: Database/Realm/Objects/RealmTemplate.swift.

class RealmTemplate: DatabaseObject {
  @Persisted var realmCategory: RealmCategory?
  @Persisted(originProperty: "realmTemplates") var realmAccounts: LinkingObjects<RealmAccount>

  @Persisted var title: String = ""
  @Persisted var amount: Int = 0
}
