import type { CommandType } from '../../commands/types.js';
import type { MigrationResult } from '../migration.service.js';

export interface MigrationIntegrationFixture {
  credentials: {
    email: string;
    password: string;
    token: string;
  };
  responses: Record<string, unknown>;
  expected: {
    imported: MigrationResult['imported'];
    // Exact command types emitted by this migration scenario.
    // This is intentionally a scenario-specific subset of COMMAND_TYPES,
    // not the full command catalog for the application.
    loggedCommandTypes: CommandType[];
    // Transactions reconciliation generates for the imported recurring items.
    generatedRecurringOccurrences: number;
    warningsContains?: string[];
  };
}
