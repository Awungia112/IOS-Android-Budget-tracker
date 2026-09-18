import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// =============================================================================
// MOCKS
// =============================================================================

const { mockCreateConnection, mockRetrieveConnection, mockCloseConnection, mockConnection } = vi.hoisted(() => {
  return {
    mockCreateConnection: vi.fn(),
    mockRetrieveConnection: vi.fn(),
    mockCloseConnection: vi.fn(),
    mockConnection: {
      open: vi.fn(),
      query: vi.fn(),
      close: vi.fn(),
    },
  };
});

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: vi.fn().mockImplementation(() => ({
    createConnection: mockCreateConnection,
    retrieveConnection: mockRetrieveConnection,
    closeConnection: mockCloseConnection,
  })),
}));

// Import AFTER mocking
import { openReadOnly, closeConnection, queryReadOnly, _resetConnectionState } from './db.js';

// =============================================================================
// TESTS
// =============================================================================

describe('db.ts SQLite connection module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetConnectionState(); // Reset connection reference counts between tests
    mockConnection.open.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // openReadOnly
  // ---------------------------------------------------------------------------

  describe('openReadOnly', () => {
    it('creates a new read-only connection when no connection exists', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);

      const result = await openReadOnly('testdb');

      expect(mockCreateConnection).toHaveBeenCalledWith(
        'testdb',
        false, // encrypted
        'no-encryption',
        1,
        true // readOnly = true
      );
      expect(mockConnection.open).toHaveBeenCalledTimes(1);
      expect(result.connection).toBe(mockConnection);
    });

    it('reuses existing connection when already opened', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);

      // First call creates connection (refcount = 1)
      await openReadOnly('testdb');
      
      // Second call reuses it (refcount = 2)
      const result = await openReadOnly('testdb');

      expect(mockCreateConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.open).toHaveBeenCalledTimes(1);
      expect(mockRetrieveConnection).toHaveBeenCalledTimes(1);
      expect(result.connection).toBe(mockConnection);
    });

    it('uses no-encryption for unencrypted databases', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);

      await openReadOnly('legacydb');

      const callArgs = mockCreateConnection.mock.calls[0];
      expect(callArgs[2]).toBe('no-encryption');
    });

    it('retrieves the existing connection for a late caller after pending creation settles', async () => {
      let resolveCreate!: (connection: typeof mockConnection) => void;
      const createPromise = new Promise<typeof mockConnection>((resolve) => {
        resolveCreate = resolve;
      });

      mockCreateConnection.mockReturnValue(createPromise as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);

      const first = openReadOnly('testdb');
      const second = openReadOnly('testdb');

      resolveCreate(mockConnection);
      const [firstResult, secondResult] = await Promise.all([first, second]);

      const third = openReadOnly('testdb');
      const thirdResult = await third;

      expect(firstResult.connection).toBe(mockConnection);
      expect(secondResult.connection).toBe(mockConnection);
      expect(thirdResult.connection).toBe(mockConnection);
      expect(mockCreateConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.open).toHaveBeenCalledTimes(1);
      expect(mockRetrieveConnection).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // closeConnection
  // ---------------------------------------------------------------------------

  describe('closeConnection', () => {
    it('closes connection when reference count reaches zero', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockCloseConnection.mockResolvedValue(undefined);

      // Open connection (refcount = 1)
      await openReadOnly('testdb');
      
      // Close connection (refcount -> 0, connection closed)
      await closeConnection('testdb');

      expect(mockCloseConnection).toHaveBeenCalledWith('testdb', true);
    });

    it('does not close connection when other references exist', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);

      // Open connection twice (refcount = 2)
      await openReadOnly('testdb');
      await openReadOnly('testdb');
      
      // Close once (refcount -> 1, connection stays open)
      await closeConnection('testdb');

      expect(mockCloseConnection).not.toHaveBeenCalled();
    });

    it('closes connection after all references are released', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);
      mockCloseConnection.mockResolvedValue(undefined);

      // Open connection twice (refcount = 2)
      await openReadOnly('testdb');
      await openReadOnly('testdb');
      
      // Close twice (refcount -> 0, connection closed)
      await closeConnection('testdb');
      await closeConnection('testdb');

      expect(mockCloseConnection).toHaveBeenCalledTimes(1);
      expect(mockCloseConnection).toHaveBeenCalledWith('testdb', true);
    });
  });

  // ---------------------------------------------------------------------------
  // queryReadOnly
  // ---------------------------------------------------------------------------

  describe('queryReadOnly', () => {
    it('executes query and returns results', async () => {
      const mockResults = [{ id: 1, name: 'Test' }];
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockConnection.query.mockResolvedValue({ values: mockResults });
      mockCloseConnection.mockResolvedValue(undefined);

      const results = await queryReadOnly('testdb', 'SELECT * FROM test');

      expect(results).toEqual(mockResults);
      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM test', []);
      expect(mockCloseConnection).toHaveBeenCalledWith('testdb', true);
    });

    it('passes query parameters', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockConnection.query.mockResolvedValue({ values: [] });
      mockCloseConnection.mockResolvedValue(undefined);

      await queryReadOnly('testdb', 'SELECT * FROM test WHERE id = ?', [42]);

      expect(mockConnection.query).toHaveBeenCalledWith('SELECT * FROM test WHERE id = ?', [42]);
    });

    it('rejects non-SELECT statements before opening a connection', async () => {
      await expect(queryReadOnly('testdb', 'DELETE FROM accounts')).rejects.toThrow(
        'queryReadOnly only accepts SELECT statements. Got: DELETE FROM accounts'
      );

      expect(mockCreateConnection).not.toHaveBeenCalled();
      expect(mockConnection.query).not.toHaveBeenCalled();
    });

    it('closes connection after query even on error', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockConnection.query.mockRejectedValue(new Error('Query failed'));
      mockCloseConnection.mockResolvedValue(undefined);

      await expect(queryReadOnly('testdb', 'SELECT * FROM test')).rejects.toThrow('Query failed');

      expect(mockCloseConnection).toHaveBeenCalledWith('testdb', true);
    });

    it('handles concurrent queries safely with reference counting', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);
      mockConnection.query.mockResolvedValue({ values: [{ id: 1 }] });
      mockCloseConnection.mockResolvedValue(undefined);

      // Simulate two concurrent queries
      const query1 = queryReadOnly('testdb', 'SELECT * FROM test');
      const query2 = queryReadOnly('testdb', 'SELECT * FROM test');

      await Promise.all([query1, query2]);

      // Both callers share the same creation promise via pendingCreations Map
      // No retrieveConnection needed - both await the same createConnection promise
      expect(mockCreateConnection).toHaveBeenCalledTimes(1);
      expect(mockConnection.open).toHaveBeenCalledTimes(1);
      expect(mockRetrieveConnection).toHaveBeenCalledTimes(0); // Not called - both share same promise
      // Connection closed once (when refcount reaches 0)
      // First close: refcount 2->1 (no native close)
      // Second close: refcount 1->0 (native close)
      expect(mockCloseConnection).toHaveBeenCalledTimes(1);
      expect(mockCloseConnection).toHaveBeenCalledWith('testdb', true);
    });

    it('returns typed results with generic parameter', async () => {
      interface TestRow {
        id: number;
        name: string;
      }
      const mockResults: TestRow[] = [{ id: 1, name: 'Test' }];
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockConnection.query.mockResolvedValue({ values: mockResults });
      mockCloseConnection.mockResolvedValue(undefined);

      const results = await queryReadOnly<TestRow>('testdb', 'SELECT * FROM test');

      expect(results).toEqual(mockResults);
    });
  });

  // ---------------------------------------------------------------------------
  // Read-only enforcement
  // ---------------------------------------------------------------------------

  describe('read-only enforcement', () => {
    it('always opens connections with readOnly=true', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);

      await openReadOnly('testdb1');
      await openReadOnly('testdb2');
      await openReadOnly('testdb3');

      const calls = mockCreateConnection.mock.calls;
      expect(calls.every(call => call[4] === true)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Reference counting
  // ---------------------------------------------------------------------------

  describe('reference counting', () => {
    it('tracks multiple open calls to same database', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);

      // Three opens
      await openReadOnly('testdb');
      await openReadOnly('testdb');
      await openReadOnly('testdb');

      expect(mockCreateConnection).toHaveBeenCalledTimes(1);
      expect(mockRetrieveConnection).toHaveBeenCalledTimes(2);
    });

    it('allows different databases to have independent reference counts', async () => {
      mockCreateConnection.mockResolvedValue(mockConnection as any);
      mockRetrieveConnection.mockResolvedValue(mockConnection as any);
      mockCloseConnection.mockResolvedValue(undefined);

      // Open db1 twice, db2 once
      await openReadOnly('db1');
      await openReadOnly('db1');
      await openReadOnly('db2');

      // Close db1 once (still has refcount 1)
      await closeConnection('db1');
      
      // Close db2 (refcount -> 0, closes)
      await closeConnection('db2');

      expect(mockCloseConnection).toHaveBeenCalledTimes(1);
      expect(mockCloseConnection).toHaveBeenCalledWith('db2', true);
    });
  });
});
