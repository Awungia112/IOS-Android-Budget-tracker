import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';

/**
 * SQLite connection singleton for migration module.
 * 
 * This provides read-only access to legacy databases.
 * All write methods are intentionally disabled for migration safety.
 */
const sqlite = new SQLiteConnection(CapacitorSQLite);

/**
 * Reference counts for active connections.
 * Tracks how many callers are using each connection.
 */
const connectionRefs = new Map<string, number>();

/**
 * Pending connection creation promises.
 * Prevents race conditions where concurrent callers try to retrieve
 * a connection that is still being created.
 */
const pendingCreations = new Map<string, Promise<SQLiteDBConnection>>();
const SELECT_STATEMENT_REGEX = /^\s*SELECT\b/i;

/**
 * Resets connection state. For testing only.
 * @internal
 */
export function _resetConnectionState(): void {
  connectionRefs.clear();
  pendingCreations.clear();
}

/** Result of opening a read-only connection */
export interface ReadOnlyConnectionResult {
  /** The database connection */
  connection: SQLiteDBConnection;
}

/**
 * Opens a read-only connection to a SQLite database.
 * 
 * Uses reference counting with promise-based locking to safely handle concurrent calls.
 * Concurrent callers awaiting connection creation share the same promise.
 * Call closeConnection when done to decrement the reference count.
 * 
 * @param dbName - The name of the database file (without .db extension)
 * @returns The database connection
 * 
 * @example
 * const conn = await openReadOnly('legacyBudget');
 * const result = await conn.query('SELECT * FROM balances');
 * await closeConnection('legacyBudget');
 */
export async function openReadOnly(dbName: string): Promise<ReadOnlyConnectionResult> {
  // Increment refCount synchronously BEFORE any await to prevent race conditions
  const refCount = (connectionRefs.get(dbName) || 0) + 1;
  connectionRefs.set(dbName, refCount);

  // Check if there's a pending creation promise (another caller is creating it)
  const pending = pendingCreations.get(dbName);
  if (pending) {
    // Wait for the same creation promise - all concurrent callers get the same promise
    try {
      return { connection: await pending };
    } catch (error) {
      // Creation failed, decrement refCount
      decrementRefCount(dbName);
      throw error;
    }
  }

  if (refCount === 1) {
    // First caller - create the connection
    // Store the promise BEFORE awaiting so concurrent callers can share it.
    // The plugin requires an explicit open() after createConnection().
    let connectionPromise: Promise<SQLiteDBConnection>;
    
    try {
      connectionPromise = (async () => {
        const connection = await sqlite.createConnection(dbName, false, 'no-encryption', 1, true);
        await connection.open();
        return connection;
      })();
      pendingCreations.set(dbName, connectionPromise);
      
      const connection = await connectionPromise;
      pendingCreations.delete(dbName);
      
      return { connection };
    } catch (error) {
      // Clean up on failure
      pendingCreations.delete(dbName);
      decrementRefCount(dbName);
      throw error;
    }
  }

  // Connection exists - retrieve it
  try {
    return {
      connection: await sqlite.retrieveConnection(dbName, true),
    };
  } catch (error) {
    decrementRefCount(dbName);
    throw error;
  }
}

/**
 * Decrements reference count for a database connection.
 * Helper function for error handling.
 */
function decrementRefCount(dbName: string): void {
  const currentRef = connectionRefs.get(dbName);
  if (currentRef && currentRef > 1) {
    connectionRefs.set(dbName, currentRef - 1);
  } else {
    connectionRefs.delete(dbName);
  }
}

/**
 * Closes a database connection (decrements reference count).
 * Connection is only closed when reference count reaches zero.
 * 
 * @param dbName - The database name to close
 */
export async function closeConnection(dbName: string): Promise<void> {
  const refCount = connectionRefs.get(dbName) || 0;
  
  if (refCount <= 1) {
    // Last caller, close connection
    connectionRefs.delete(dbName);
    await sqlite.closeConnection(dbName, true);
  } else {
    // Other callers still using it, decrement refcount
    connectionRefs.set(dbName, refCount - 1);
  }
}

/**
 * Executes a query against a read-only database connection.
 * Convenience wrapper for common query pattern.
 * 
 * Safe for concurrent calls - uses reference counting to manage connection lifecycle.
 * 
 * @param dbName - Database name
 * @param sql - SQL query (SELECT statements only)
 * @param params - Query parameters
 * @returns Query results
 */
export async function queryReadOnly<T = unknown>(
  dbName: string,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  if (!SELECT_STATEMENT_REGEX.test(sql)) {
    throw new Error(
      `queryReadOnly only accepts SELECT statements. Got: ${sql.slice(0, 40)}`
    );
  }

  const { connection } = await openReadOnly(dbName);
  try {
    const result = await connection.query(sql, params);
    return result.values as T[];
  } finally {
    await closeConnection(dbName);
  }
}
