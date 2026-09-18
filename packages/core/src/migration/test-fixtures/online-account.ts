import { COMMAND_TYPES } from '../../commands/types.js';
import type { MigrationIntegrationFixture } from './types.js';

/**
 * Fixture for testing online account detection.
 * This account has last_synced set and member accesses to verify
 * the detectOnlineAccount post-step sets the needsOnlinePush flag.
 */
export const onlineAccountFixture: MigrationIntegrationFixture = {
  credentials: {
    email: 'online-user@example.com',
    password: 'Secret123!',
    token: 'token-online-account',
  },
  responses: {
    'POST /user/get-token': { token: 'token-online-account' },
    'GET /api/accounts': [
      {
        id: 97,
        name: 'Shared Online Budget',
        acronym: 'SO',
        color: '#ff8840',
        deleted: false,
        last_synced: '2022-11-21T17:37:28.556360Z', // This indicates the account was online
      },
    ],
    'GET /api/access': [
      {
        id: 1,
        role: 'owner',
        account: 97,
        user: { id: 10, email: 'online-user@example.com' },
      },
      {
        id: 2,
        role: 'member',
        account: 97,
        user: { id: 11, email: 'member@example.com' },
      },
    ],
    'GET /api/balance?account_id=97': [
      {
        id: 301,
        name: 'Salary',
        balanceType: 'BT_INCOME',
        date: '2026-02-01T08:00:00.000Z',
        amount: 3000,
        deleted: false,
        account: 97,
        category: 201,
        saving_goal: null,
        recuring: null,
        user: 10,
        target_account: null,
        sender_account: null,
        target_balance_id: null,
        sender_balance_id: null,
        is_transfer_balance: false,
      },
    ],
    'GET /api/category?account_id=97': [
      {
        id: 201,
        name: 'Income',
        icon: 'kategorie_einnahmen_1',
        balanceType: 'BT_INCOME',
        active: true,
        is_deletable: false,
        limits: null,
        limitsDate: null,
        deleted: false,
        account: 97,
        default: null,
      },
    ],
    'GET /api/recuring?account_id=97': [],
    'GET /api/saving-goal?category_id=201': [],
  },
  expected: {
    imported: {
      accounts: 1,
      transactions: 1,
      categories: 1,
      limits: 0,
      templates: 0,
      recurringItems: 0,
      savingsGoals: 0,
    },
    loggedCommandTypes: [
      COMMAND_TYPES.CREATE_ACCOUNT,
      COMMAND_TYPES.CREATE_CATEGORY,
      COMMAND_TYPES.CREATE_TRANSACTION,
      COMMAND_TYPES.BULK_CREATE_CATEGORIES,
    ],
    generatedRecurringOccurrences: 0,
    warningsContains: [],
  },
};
