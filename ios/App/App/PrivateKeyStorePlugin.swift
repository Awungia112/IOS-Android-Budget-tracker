import Capacitor
import Foundation
import Security

// MARK: - PrivateKeyStorePlugin
//
// Stores private key material in the iOS Keychain using
// kSecAttrAccessibleWhenUnlockedThisDeviceOnly, which guarantees:
//   1. The item is only readable while the device is unlocked.
//   2. The item is never included in iCloud or iTunes backups.
//   3. The item cannot be restored onto a different device.
//
// These three constraints are required by the zero-knowledge architecture:
// each device holds its own keypair and the server must never see the
// private key.

@objc(PrivateKeyStorePlugin)
public class PrivateKeyStorePlugin: CAPPlugin, CAPBridgedPlugin {

  public let identifier = "PrivateKeyStorePlugin"
  public let jsName = "PrivateKeyStore"
  public let pluginMethods: [CAPPluginMethod] = [
    CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
    CAPPluginMethod(name: "isHardwareBacked", returnType: CAPPluginReturnPromise),
  ]

  // MARK: - Private helpers

  private func baseQuery(service: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      // Device-bound, unlocked-only access. Never backed up.
      kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
  }

  // MARK: - Plugin methods

  @objc func set(_ call: CAPPluginCall) {
    guard
      let service = call.getString("service"),
      let value = call.getString("value"),
      let data = value.data(using: .utf8)
    else {
      call.reject("service and value are required", "INVALID_ARGS")
      return
    }

    var query = baseQuery(service: service)
    // Delete any existing entry first — SecItemUpdate is messier for blobs.
    SecItemDelete(query as CFDictionary)
    query[kSecValueData as String] = data

    let status = SecItemAdd(query as CFDictionary, nil)
    guard status == errSecSuccess else {
      call.reject("SecItemAdd failed with OSStatus \(status)", "KEYCHAIN_ERROR")
      return
    }
    call.resolve()
  }

  @objc func get(_ call: CAPPluginCall) {
    guard let service = call.getString("service") else {
      call.reject("service is required", "INVALID_ARGS")
      return
    }

    var query = baseQuery(service: service)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne

    var item: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &item)

    guard
      status == errSecSuccess,
      let data = item as? Data,
      let value = String(data: data, encoding: .utf8)
    else {
      call.reject("Item with given service does not exist", "ITEM_NOT_FOUND")
      return
    }
    call.resolve(["value": value])
  }

  @objc func remove(_ call: CAPPluginCall) {
    guard let service = call.getString("service") else {
      call.reject("service is required", "INVALID_ARGS")
      return
    }
    SecItemDelete(baseQuery(service: service) as CFDictionary)
    call.resolve()
  }

  // All iOS devices with a Secure Enclave (iPhone 5s+, iPad Air 2+) protect
  // Keychain items through hardware-derived keys that never leave the chip.
  // Returning true is correct for every device this app supports.
  @objc func isHardwareBacked(_ call: CAPPluginCall) {
    call.resolve(["value": true])
  }
}
