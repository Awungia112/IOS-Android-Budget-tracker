package de.deutschlandimplus.meinbudget

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

private const val TAG = "PrivateKeyStorePlugin"

@CapacitorPlugin(name = "PrivateKeyStore")
class PrivateKeyStorePlugin : Plugin() {

    private val storage: PrivateKeyStoreStorage
        get() = PrivateKeyStoreStorage(context)

    @PluginMethod
    fun set(call: PluginCall) {
        val service = call.getString("service") ?: return call.reject("service is required", "INVALID_ARGS")
        val value = call.getString("value") ?: return call.reject("value is required", "INVALID_ARGS")
        try {
            storage.set(service, value)
            call.resolve()
        } catch (e: Exception) {
            // Self-heal in PrivateKeyStoreStorage.prefs() should already have
            // cleared any corrupt keystore state; if we still end up here the
            // storage layer is genuinely broken. Reject the JS call so the app
            // stays alive and the JS layer can surface the error, instead of
            // letting the exception kill the CapacitorPlugins thread (which
            // triggers a process SIGKILL — see RecoveryCode flow regression).
            Log.e(TAG, "set failed for service=$service: ${e.message}", e)
            call.reject("Failed to store private key: ${e.message}", "STORAGE_ERROR")
        }
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val service = call.getString("service") ?: return call.reject("service is required", "INVALID_ARGS")
        try {
            val value = storage.get(service)
                ?: return call.reject("Item with given service does not exist", "ITEM_NOT_FOUND")
            call.resolve(JSObject().put("value", value))
        } catch (e: Exception) {
            Log.e(TAG, "get failed for service=$service: ${e.message}", e)
            call.reject("Failed to read private key: ${e.message}", "STORAGE_ERROR")
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val service = call.getString("service") ?: return call.reject("service is required", "INVALID_ARGS")
        try {
            storage.remove(service)
            call.resolve()
        } catch (e: Exception) {
            Log.e(TAG, "remove failed for service=$service: ${e.message}", e)
            call.reject("Failed to remove private key: ${e.message}", "STORAGE_ERROR")
        }
    }

    // Checks whether the Android Keystore master key protecting private key
    // storage is backed by a hardware security module (TEE or StrongBox).
    // Returns false on emulators and on devices where the Keystore
    // initialization fell back to software. The JS layer uses this to surface
    // a warning in the registration flow rather than silently accepting a
    // weaker security posture.
    @PluginMethod
    fun isHardwareBacked(call: PluginCall) {
        try {
            call.resolve(JSObject().put("value", storage.isHardwareBacked()))
        } catch (e: Exception) {
            Log.w(TAG, "isHardwareBacked check failed, defaulting to false: ${e.message}")
            call.resolve(JSObject().put("value", false))
        }
    }
}
