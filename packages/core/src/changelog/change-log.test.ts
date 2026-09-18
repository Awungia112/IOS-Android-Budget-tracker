/**
 * ChangeLog Unit Tests
 * 
 * Tests the command logging functionality including sequence number assignment
 * and cursor-based filtering to prevent data loss during sync operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChangeLog } from './change-log.js';
import { COMMAND_TYPES } from '../commands/types.js';
import type { CommandInput } from '../commands/types.js';

describe('ChangeLog', () => {
  let log: ChangeLog;

  beforeEach(async () => {
    // Reuse singleton instance and clear any data from previous tests
    log = new ChangeLog();
    await log.clear();
  });

  afterEach(async () => {
    // Clean up after each test
    await log.clear();
  });

  describe('Sequence Number Assignment', () => {
    it('append delegates to the batch path and persists one record', async () => {
      const record = await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Delegated', initials: 'D' },
      }, 'account-1');

      expect(record.command.sequence).toBe(1);
      expect(await log.getAll()).toEqual([record]);
    });

    it('should auto-assign sequential numbers starting from 1', async () => {
      const cmd1: CommandInput = {
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test', initials: 'T' }
      };

      const cmd2: CommandInput = {
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test Transaction' }
      };

      await log.append(cmd1, 'account-1');
      await log.append(cmd2, 'account-1');

      const commands = await log.getAll();
      expect(commands[0].command.sequence).toBe(1);
      expect(commands[1].command.sequence).toBe(2);
    });

    it('should assign unique sequences even with identical timestamps', async () => {
      const timestamp = '2024-01-01T00:00:00.123Z';
      
      // Simulate tight loop creating multiple commands in same millisecond
      for (let i = 0; i < 10; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_CATEGORY,
          timestamp,
          payload: { name: `Category ${i}`, type: 'expense' }
        }, 'account-1');
      }

      const commands = await log.getAll();
      expect(commands).toHaveLength(10);
      
      // Verify all sequences are unique and sequential
      const sequences = commands.map(rec => rec.command.sequence);
      expect(sequences).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      
      // Verify all timestamps are identical
      const timestamps = commands.map(rec => rec.command.timestamp);
      expect(new Set(timestamps).size).toBe(1);
    });

    it('should continue sequence numbering after clear', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Account 1', initials: 'A1' }
      }, 'account-1');

      await log.clear();

      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:01.000Z',
        payload: { name: 'Account 2', initials: 'A2' }
      }, 'account-2');

      const commands = await log.getAll();
      // After clear, sequence should restart from 1
      expect(commands[0].command.sequence).toBe(1);
    });

    it('should auto-generate timestamp if not provided', async () => {
      const beforeTime = new Date().toISOString();
      
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        payload: { name: 'Test Account', initials: 'TA' }
        // No timestamp provided
      }, 'account-1');

      const afterTime = new Date().toISOString();
      const commands = await log.getAll();
      
      expect(commands[0].command.timestamp).toBeDefined();
      expect(commands[0].command.timestamp).toBeTypeOf('string');
      // Timestamp should be between before and after
      expect(commands[0].command.timestamp! >= beforeTime).toBe(true);
      expect(commands[0].command.timestamp! <= afterTime).toBe(true);
    });

    it('should preserve provided timestamp if given', async () => {
      const customTimestamp = '2020-01-01T00:00:00.000Z';
      
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: customTimestamp,
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      const commands = await log.getAll();
      expect(commands[0].command.timestamp).toBe(customTimestamp);
    });
  });

  describe('getAfterSequence', () => {
    beforeEach(async () => {
      // Create 5 commands with same timestamp
      const timestamp = '2024-01-01T00:00:00.000Z';
      for (let i = 1; i <= 5; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_CATEGORY,
          timestamp,
          payload: { name: `Category ${i}`, type: 'expense' }
        }, 'account-1');
      }
    });

    it('should return commands after specified sequence', async () => {
      const commands = await log.getAfterSequence(2);
      
      expect(commands).toHaveLength(3);
      expect(commands[0].command.sequence).toBe(3);
      expect(commands[1].command.sequence).toBe(4);
      expect(commands[2].command.sequence).toBe(5);
    });

    it('should return all commands when sequence is 0', async () => {
      const commands = await log.getAfterSequence(0);
      
      expect(commands).toHaveLength(5);
      expect(commands[0].command.sequence).toBe(1);
    });

    it('should return empty array when sequence is last', async () => {
      const commands = await log.getAfterSequence(5);
      
      expect(commands).toHaveLength(0);
    });

    it('should not skip commands with identical timestamps', async () => {
      // This is the critical test - ensures no data loss during sync
      const commands = await log.getAfterSequence(1);
      
      // Should get commands 2, 3, 4, 5 even though they all have same timestamp
      expect(commands).toHaveLength(4);
      expect(commands.map(rec => rec.command.sequence)).toEqual([2, 3, 4, 5]);
    });
  });

  describe('getAfter (deprecated timestamp-based)', () => {
    it('should filter by timestamp but may skip commands with same timestamp', async () => {
      const timestamp1 = '2024-01-01T00:00:00.000Z';
      const timestamp2 = '2024-01-01T00:00:00.001Z';

      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: timestamp1,
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      await log.append({
        type: COMMAND_TYPES.CREATE_CATEGORY,
        timestamp: timestamp1, // Same timestamp
        payload: { name: 'Test Category', type: 'expense' }
      }, 'account-1');

      await log.append({
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: timestamp2, // Different timestamp
        payload: { type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test Transaction' }
      }, 'account-1');

      // Using timestamp1 as cursor will skip the second command
      const commands = await log.getAfter(timestamp1);
      
      // Only gets the command with timestamp2, misses the second command with timestamp1
      expect(commands).toHaveLength(1);
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_TRANSACTION);
    });
  });

  describe('getLastSequence', () => {
    it('should return 0 for empty log', async () => {
      expect(await log.getLastSequence()).toBe(0);
    });

    it('should return the highest sequence number', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      await log.append({
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test Transaction' }
      }, 'account-1');

      expect(await log.getLastSequence()).toBe(2);
    });

    it('should update after new commands are added', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      expect(await log.getLastSequence()).toBe(1);

      await log.append({
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test Transaction' }
      }, 'account-1');

      expect(await log.getLastSequence()).toBe(2);
    });

    it('should return 0 after clear', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      expect(await log.getLastSequence()).toBe(1);

      await log.clear();

      expect(await log.getLastSequence()).toBe(0);
    });
  });

  describe('Sync Scenario Simulation', () => {
    it('should handle rapid command generation without data loss', async () => {
      // Simulate BudgetService.createAccount which logs 1 account + 1 bulk categories command
      const timestamp = new Date().toISOString();
      
      // Account creation
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp,
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      // Bulk category creation (single command for all 26 default categories)
      const categories = Array.from({ length: 26 }, (_, i) => ({
        id: `cat-${i}`,
        name: `Category ${i}`,
        type: 'expense' as const,
        accountId: 'account-1',
        isDefault: true
      }));
      
      await log.append({
        type: COMMAND_TYPES.BULK_CREATE_CATEGORIES,
        timestamp, // Same millisecond
        payload: { categories }
      }, 'account-1');

      // Total: 2 commands (account + bulk categories)
      expect(await log.count()).toBe(2);

      // Simulate sync: client has processed up to sequence 1
      const lastSyncedSequence = 1;
      const newCommands = await log.getAfterSequence(lastSyncedSequence);

      // Should get command 2 (bulk categories)
      expect(newCommands).toHaveLength(1);
      expect(newCommands[0].command.sequence).toBe(2);

      // Verify no commands were skipped
      const sequences = newCommands.map(rec => rec.command.sequence);
      for (let i = 0; i < sequences.length - 1; i++) {
        expect(sequences[i + 1] - sequences[i]).toBe(1);
      }
    });

    it('should handle import operation with multiple entity types', async () => {
      const timestamp = new Date().toISOString();
      
      // Simulate importData logging individual commands
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp,
        payload: { name: 'Imported Account', initials: 'IA' }
      }, 'account-1');

      // 5 categories
      for (let i = 0; i < 5; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_CATEGORY,
          timestamp,
          payload: { name: `Category ${i}`, type: 'expense' }
        }, 'account-1');
      }

      // 10 transactions
      for (let i = 0; i < 10; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_TRANSACTION,
          timestamp,
          payload: { type: 'expense', amount: 100 + i, category: `cat-${i}`, date: '2024-01-01', title: `Transaction ${i}` }
        }, 'account-1');
      }

      // 3 limits
      for (let i = 0; i < 3; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_LIMIT,
          timestamp,
          payload: { categoryId: `cat-${i}`, amount: 1000 + i }
        }, 'account-1');
      }

      // Total: 19 commands, all with same timestamp
      expect(await log.count()).toBe(19);

      // Using sequence-based filtering ensures all commands are captured
      const allCommands = await log.getAfterSequence(0);
      expect(allCommands).toHaveLength(19);

      // Using timestamp-based filtering would miss 18 commands
      const timestampFiltered = await log.getAfter(timestamp);
      expect(timestampFiltered).toHaveLength(0); // All have same timestamp!
    });
  });

  describe('Basic Operations', () => {
    it('should return empty array for new log', async () => {
      expect(await log.getAll()).toEqual([]);
      expect(await log.count()).toBe(0);
    });

    it('should store and retrieve commands', async () => {
      const cmd: CommandInput = {
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test', initials: 'T' }
      };

      await log.append(cmd, 'account-1');

      const commands = await log.getAll();
      expect(commands).toHaveLength(1);
      expect(commands[0].command.type).toBe(COMMAND_TYPES.CREATE_ACCOUNT);
      expect(commands[0].command.payload).toEqual(cmd.payload);
      expect(commands[0].command.sequence).toBe(1);
    });

    it('should clear all commands', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      await log.clear();

      expect(await log.getAll()).toEqual([]);
      expect(await log.count()).toBe(0);
    });
  });

  describe('Rollback Operations', () => {
    it('should rollback commands after a specific sequence', async () => {
      // Add 5 commands
      for (let i = 1; i <= 5; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_CATEGORY,
          timestamp: '2024-01-01T00:00:00.000Z',
          payload: { name: `Category ${i}`, type: 'expense' }
        }, 'account-1');
      }

      expect(await log.count()).toBe(5);

      // Rollback everything after sequence 2
      const removed = await log.rollbackAfter(2);

      expect(removed).toBe(3);
      expect(await log.count()).toBe(2);
      
      const remaining = await log.getAll();
      expect(remaining[0].command.sequence).toBe(1);
      expect(remaining[1].command.sequence).toBe(2);
    });

    it('should reset nextSequence after rollback', async () => {
      // Add 3 commands
      for (let i = 1; i <= 3; i++) {
        await log.append({
          type: COMMAND_TYPES.CREATE_CATEGORY,
          timestamp: '2024-01-01T00:00:00.000Z',
          payload: { name: `Category ${i}`, type: 'expense' }
        }, 'account-1');
      }

      // Rollback to sequence 1
      await log.rollbackAfter(1);

      // Add a new command - should get sequence 2
      await log.append({
        type: COMMAND_TYPES.CREATE_TRANSACTION,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { type: 'expense', amount: 100, category: 'cat-1', date: '2024-01-01', title: 'Test Transaction' }
      }, 'account-1');

      const commands = await log.getAll();
      expect(commands).toHaveLength(2);
      expect(commands[0].command.sequence).toBe(1);
      expect(commands[1].command.sequence).toBe(2);
    });

    it('should handle rollback to sequence 0 (remove all)', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      await log.append({
        type: COMMAND_TYPES.CREATE_CATEGORY,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Category', type: 'expense' }
      }, 'account-1');

      const removed = await log.rollbackAfter(0);

      expect(removed).toBe(2);
      expect(await log.count()).toBe(0);
      expect(await log.getLastSequence()).toBe(0);
    });

    it('should return 0 when rolling back with no commands to remove', async () => {
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      // Rollback after sequence 1 (nothing to remove)
      const removed = await log.rollbackAfter(1);

      expect(removed).toBe(0);
      expect(await log.count()).toBe(1);
    });

    it('should handle transaction rollback scenario', async () => {
      // Simulate a failed createAccount operation
      const sequenceBeforeOp = await log.getLastSequence(); // 0

      // Account created successfully
      await log.append({
        type: COMMAND_TYPES.CREATE_ACCOUNT,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Test Account', initials: 'TA' }
      }, 'account-1');

      // Start adding categories
      await log.append({
        type: COMMAND_TYPES.CREATE_CATEGORY,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Category 1', type: 'expense' }
      }, 'account-1');

      await log.append({
        type: COMMAND_TYPES.CREATE_CATEGORY,
        timestamp: '2024-01-01T00:00:00.000Z',
        payload: { name: 'Category 2', type: 'expense' }
      }, 'account-1');

      // Simulate failure - rollback all commands from this operation
      await log.rollbackAfter(sequenceBeforeOp);

      expect(await log.count()).toBe(0);
      expect(await log.getLastSequence()).toBe(0);
    });
  });
});
