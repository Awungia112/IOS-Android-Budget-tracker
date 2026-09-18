package de.deutschlandimplus.meinbudget

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.io.IOException
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.SecretKeyFactory

private const val PREFS_FILE = "de.deutschlandimplus.meinbudget.privatekeys"
private const val MASTER_KEY_ALIAS = "_meinbudget_privatekeys_master_"
private const val TAG = "PrivateKeyStoreStorage"

class PrivateKeyStoreStorage(private val context: Context) {

    private fun masterKey(): MasterKey =
        MasterKey.Builder(context, MASTER_KEY_ALIAS)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

    private fun createPrefs(masterKey: MasterKey): SharedPreferences =
        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )

    /**
     * Returns the [EncryptedSharedPreferences] instance used to persist private keys.
     *
     * EncryptedSharedPreferences wraps a Tink keyset with an Android Keystore
     * master key (alias [_meinbudget_privatekeys_master_]). When the wrapped
     * master-key keyset stored in the prefs file cannot be decrypted by the
     * keystore — e.g. after a device PIN change, a TEE/StrongBox reset, or an
     * install-over-update where the prefs file references an alias the keystore
     * no longer recognises — [EncryptedSharedPreferences.create] throws
     * `AEADBadTagException` (KeyStore code -30, MAC verification failed).
     *
     * Previously this exception propagated uncaught, killing the Capacitor
     * plugin thread and SIGKILL'ing the app on every storePrivateKey() call
     * (login Continue, recovery Restore Account, etc.).
     *
     * Now we catch the security/IO failure, wipe the corrupted prefs file AND
     * the stale keystore alias, and retry [createPrefs] once. The cost is the
     * loss of any previously stored private keys — the user must re-register
     * or re-recover — which is strictly better than a hard crash. The JS layer
     * (AccountContext / recovery flow) already handles a missing private key
     * by routing the user to login/recovery.
     *
     * If the second attempt also fails, the exception propagates to the
     * caller; [PrivateKeyStorePlugin] converts it to a rejected JS call so the
     * app stays alive and the JS layer can surface the error to the user.
     */
    private fun prefs(): SharedPreferences =
        try {
            createPrefs(masterKey())
        } catch (e: GeneralSecurityException) {
            Log.w(TAG, "EncryptedSharedPreferences unavailable, recreating keystore + prefs: ${e.message}")
            recreateKeystoreAndPrefs()
            createPrefs(masterKey())
        } catch (e: IOException) {
            Log.w(TAG, "EncryptedSharedPreferences IO failure, recreating keystore + prefs: ${e.message}")
            recreateKeystoreAndPrefs()
            createPrefs(masterKey())
        }

    /**
     * Wipe the corrupted prefs file and delete the federated Android Keystore
     * master-key alias so the next [masterKey] / [createPrefs] call can mint
     * fresh ones. Best-effort: errors are logged but not propagated so that
     * [prefs]'s retry path can still attempt a [createPrefs].
     *
     * Deleting the prefs file alone is insufficient because [createPrefs]
     * still needs the keystore alias to be present and usable; if the alias is
     * unusable (e.g. PIN-invalidated) it will still throw. Conversely deleting
     * the alias alone is insufficient because [createPrefs]'s read path first
     * opens the prefs file (if present) and tries to unwrap the master-key
     * keyset stored there using the keystore alias. Both must be cleared.
     */
    private fun recreateKeystoreAndPrefs() {
        try {
            context.deleteSharedPreferences(PREFS_FILE)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to delete corrupted EncryptedSharedPreferences file: ${e.message}")
        }
        try {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
                .deleteEntry(MASTER_KEY_ALIAS)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to delete stale keystore alias: ${e.message}")
        }
    }

    fun set(service: String, value: String) {
        prefs().edit().putString(service, value).apply()
    }

    fun get(service: String): String? = prefs().getString(service, null)

    fun remove(service: String) {
        prefs().edit().remove(service).apply()
    }

    fun isHardwareBacked(): Boolean {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

        if (!keyStore.containsAlias(MASTER_KEY_ALIAS)) {
            masterKey()
        }

        val secretKey = keyStore.getKey(MASTER_KEY_ALIAS, null) as? javax.crypto.SecretKey
            ?: return false

        val factory = SecretKeyFactory.getInstance(secretKey.algorithm, "AndroidKeyStore")
        val keyInfo = factory.getKeySpec(secretKey, KeyInfo::class.java) as KeyInfo

        @Suppress("DEPRECATION")
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            keyInfo.securityLevel != KeyProperties.SECURITY_LEVEL_SOFTWARE
        } else {
            keyInfo.isInsideSecureHardware
        }
    }
}
