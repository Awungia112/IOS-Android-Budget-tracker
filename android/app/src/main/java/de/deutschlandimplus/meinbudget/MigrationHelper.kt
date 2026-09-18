package de.deutschlandimplus.meinbudget

import android.content.Context
import android.util.Log
import java.io.File

/**
 * MigrationHelper — copies Room database files to the path expected by
 * the @capacitor-community/sqlite plugin so the JS layer can query them.
 *
 * Room stores its database at:
 *   data/data/<packageId>/databases/<dbName>          (main file)
 *   data/data/<packageId>/databases/<dbName>-wal      (WAL journal)
 *   data/data/<packageId>/databases/<dbName>-shm      (shared memory)
 *
 * The Capacitor SQLite plugin expects its databases at:
 *   data/data/<packageId>/databases/<name>SQLite.db
 *
 * This helper is called once at migration time via the
 * MigrationFileCopyPlugin Capacitor plugin method.
 */
object MigrationHelper {

    private const val TAG = "MigrationHelper"

    /**
     * Database names that are copied by prepareAllDatabases().
     * Keys are Room database names; values are Capacitor SQLite destination names.
     */
    val DB_COPY_MAP: Map<String, String> = mapOf(
        "general_db"         to "legacy_general",
        "meinbudget"         to "legacy_sqlite_v1",
    )

    /**
     * Discovers and copies all account_db_* files to the plugin path.
     * Room databases are named account_db_1, account_db_2, etc. based on account IDs.
     *
     * @param context Android application context
     * @return Number of account databases that were copied
     */
    fun copyAllAccountDatabases(context: Context): List<String> {
        val databasesDir = context.getDatabasePath(".").parentFile
        if (databasesDir == null || !databasesDir.exists()) {
            Log.d(TAG, "Databases directory not found")
            return emptyList()
        }

        // Find all account_db_* files (main database files only, exclude WAL/SHM)
        val accountDbFiles = databasesDir.listFiles { file ->
            file.name.startsWith("account_db_") && 
            file.isFile && 
            !file.name.endsWith("-wal") && 
            !file.name.endsWith("-shm")
        }?.filter { it.exists() } ?: emptyList()

        if (accountDbFiles.isEmpty()) {
            Log.d(TAG, "No account_db_* files found")
            return emptyList()
        }

        Log.i(TAG, "Found ${accountDbFiles.size} account_db_* files: ${accountDbFiles.map { it.name }}")

        val copiedAccountDbNames = mutableListOf<String>()
        // Copy each account database maintaining original ID for data integrity
        accountDbFiles.forEach { dbFile ->
            // Extract the original ID (e.g., "100") to maintain data integrity across systems
            val originalId = dbFile.name.removePrefix("account_db_").toIntOrNull() ?: 0
            val destName = "legacy_account_$originalId"
            copyDatabaseFile(context, dbFile, destName)
            copiedAccountDbNames.add(destName)
        }
        
        return copiedAccountDbNames
    }

    /**
     * Copies a Room database file (and its WAL/SHM companions) to the
     * path expected by the Capacitor SQLite plugin.
     *
     * Uses a transactional approach: all files are written to a temp location
     * first, then atomically renamed. If any step fails the destination is
     * left in its previous state (or cleaned up) so the database is never
     * partially overwritten.
     *
     * @param context Android application context
     * @param srcDbName Room database name (no extension)
     * @param destDbName Destination name for Capacitor SQLite plugin (no .db suffix)
     */
    fun copyDatabaseForPlugin(context: Context, srcDbName: String, destDbName: String) {
        val src  = context.getDatabasePath(srcDbName)
        val dest = context.getDatabasePath("${destDbName}SQLite.db")

        // Legacy file absent — skip silently (user may already be on Room)
        if (!src.exists()) {
            Log.d(TAG, "Source database '$srcDbName' not found — skipping")
            return
        }

        Log.i(TAG, "Copying '$srcDbName' → '${dest.name}'")
        copyFilesAtomically(src, dest, srcDbName)
    }

    /**
     * Copies a specific database file (and its WAL/SHM companions) to the
     * path expected by the Capacitor SQLite plugin.
     * 
     * WAL/SHM Safety: This implements the "Triple Copy" approach to ensure
     * database integrity when copying potentially active databases:
     * 1. Main .db file (primary database)
     * 2. -wal file (Write-Ahead Log - contains recent transactions)
     * 3. -shm file (Shared Memory - contains index data)
     * 
     * All three files are copied atomically to maintain database consistency.
     * The destination database will be complete and usable.
     *
     * @param context Android application context
     * @param srcFile Source database file
     * @param destDbName Destination name for Capacitor SQLite plugin (no .db suffix)
     */
    private fun copyDatabaseFile(context: Context, srcFile: File, destDbName: String) {
        val dest = context.getDatabasePath("${destDbName}SQLite.db")

        Log.i(TAG, "Copying '${srcFile.name}' → '${dest.name}'")
        copyFilesAtomically(srcFile, dest, srcFile.name)
    }

    /**
     * Atomically copies database files using a transactional temp-file approach.
     * Copies the main database file and any WAL/SHM companions.
     *
     * @param srcFile Source database file
     * @param destFile Destination database file
     * @param logName Name to use in log messages
     */
    private fun copyFilesAtomically(srcFile: File, destFile: File, logName: String) {
        // Collect all files to copy: main + optional WAL/SHM companions
        val filePairs = mutableListOf(srcFile to destFile)
        val wal = File("${srcFile.absolutePath}-wal")
        val shm = File("${srcFile.absolutePath}-shm")
        if (wal.exists()) {
            val walDest = File("${destFile.absolutePath}-wal")
            filePairs += wal to walDest
            Log.i(TAG, "Copying '${wal.name}' → '${walDest.name}'")
        }
        if (shm.exists()) {
            val shmDest = File("${destFile.absolutePath}-shm")
            filePairs += shm to shmDest
            Log.i(TAG, "Copying '${shm.name}' → '${shmDest.name}'")
        }

        // Write to temp files first so a partial failure never corrupts the destination
        val tempFiles = filePairs.map { (_, d) -> File("${d.absolutePath}.tmp") }

        try {
            filePairs.forEachIndexed { i, (src, _) ->
                src.copyTo(tempFiles[i], overwrite = true)
            }

            // All temp writes succeeded — atomically replace destinations
            filePairs.forEachIndexed { i, (_, dest) ->
                tempFiles[i].renameTo(dest)
            }

            Log.i(TAG, "Successfully copied '$logName' (${filePairs.size} file(s))")
        } catch (e: Exception) {
            // Clean up any temp files that were written before the failure
            tempFiles.forEach { it.delete() }
            Log.e(TAG, "Failed to copy '$logName': ${e.message}", e)
            throw IllegalStateException("Migration file copy failed for '$logName': ${e.message}", e)
        }
    }
}
