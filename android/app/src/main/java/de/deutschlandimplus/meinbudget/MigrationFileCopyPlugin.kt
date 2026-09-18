package de.deutschlandimplus.meinbudget

import android.util.Log
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/**
 * MigrationFileCopyPlugin — exposes MigrationHelper as a one-shot Capacitor
 * plugin method callable from the JavaScript layer.
 *
 * Usage from TypeScript:
 *   import { MigrationFileCopyPlugin } from '@/migration/local/android-plugin';
 *   await MigrationFileCopyPlugin.prepareAndroidDatabases();
 *
 * Registration: add registerPlugin(MigrationFileCopyPlugin::class.java) in
 * MainActivity.onCreate() before super.onCreate().
 */
@CapacitorPlugin(name = "MigrationFileCopy")
class MigrationFileCopyPlugin : Plugin() {

    private val TAG = "MigrationFileCopyPlugin"

    /**
     * Copies all known Room databases to the Capacitor SQLite plugin path.
     * Safe to call multiple times — files are overwritten idempotently.
     *
     * Resolves with the count of account databases that were copied.
     * Rejects with an error message if any copy operation fails.
     */
    @PluginMethod
    fun prepareAndroidDatabases(call: PluginCall) {
        // Validate context is available before proceeding
        val ctx = context ?: run {
            val msg = "Plugin context is null — cannot access database paths"
            Log.e(TAG, msg)
            call.reject(msg)
            return
        }

        try {
            // Copy all account_db_* files (account databases are versioned by account ID)
            val accountDbNames = MigrationHelper.copyAllAccountDatabases(ctx)
            
            // Copy other Room databases to the plugin-expected path.
            // DB_COPY_MAP keys are Room.databaseBuilder() names;
            // values are the dbName argument used in openReadOnly().
            for ((srcName, destName) in MigrationHelper.DB_COPY_MAP) {
                MigrationHelper.copyDatabaseForPlugin(ctx, srcName, destName)
            }
            Log.i(TAG, "prepareAndroidDatabases completed successfully")
            val result = JSObject()
            result.put("accountDbCount", accountDbNames.size as Int)
            val accountDbNamesArray = JSArray()
            accountDbNames.forEach { accountDbNamesArray.put(it) }
            result.put("accountDbNames", accountDbNamesArray)
            call.resolve(result)
        } catch (e: Exception) {
            val msg = "prepareAndroidDatabases failed: ${e.message}"
            Log.e(TAG, msg, e)
            call.reject(msg, e)
        }
    }
}
