/**
 * Replays commands pulled from an online account's server stream onto this
 * device's own copy of that account.
 *
 * Every device stores its copy of an online account under a local id of its
 * own, but a pulled command still carries the ids of the device that wrote it.
 * Each command is re-targeted before it is applied: executeCommand() writes
 * with put(), so an UPDATE_ACCOUNT still pointing at its author's id inserts
 * the author's account here as a second, empty, unlinked account. Logout only
 * removes linked accounts, so that copy survives it, and the next sign-in
 * restores the real account beside it under the same name.
 *
 * The regular sync, the sign-in restore and shared-account provisioning all
 * pull into an account that already exists locally, and must share one set of
 * rules. Recovery replay deliberately does not use this: it rebuilds accounts
 * under the ids their records carry.
 */

import type { Command } from '@budget/core';

export interface RemoteReplayService {
  executeCommand(command: Command): Promise<void>;
  /** Applies a replayed name without logging it. Returns false when it was not applied. */
  applyRemoteAccountName(
    accountId: string,
    details: { name?: string; initials?: string },
  ): Promise<boolean>;
}

function retarget(command: Command, localAccountId: string): Command {
  if (command.type === 'UPDATE_ACCOUNT') {
    return { ...command, payload: { ...command.payload, id: localAccountId } };
  }

  if (
    command.type === 'BULK_CREATE_CATEGORIES' &&
    Array.isArray(command.payload?.categories)
  ) {
    return {
      ...command,
      payload: {
        ...command.payload,
        categories: command.payload.categories.map((category) => ({
          ...category,
          accountId: localAccountId,
        })),
      },
    };
  }

  const payload = command.payload as { accountId?: unknown } | undefined;
  if (typeof payload?.accountId === 'string') {
    return { ...command, payload: { ...payload, accountId: localAccountId } } as Command;
  }

  const nestedTransaction = (payload as { transaction?: { accountId?: unknown } } | undefined)?.transaction;
  if (nestedTransaction && typeof nestedTransaction.accountId === 'string') {
    return {
      ...command,
      payload: {
        ...payload,
        transaction: {
          ...nestedTransaction,
          accountId: localAccountId,
        },
      },
    } as unknown as Command;
  }

  return command;
}

/**
 * Build the executeCommand handler for a sync that pulls into `localAccountId`.
 */
export function createRemoteCommandReplayer(
  localAccountId: string,
  service: RemoteReplayService,
): (command: Command) => Promise<void> {
  return async (command) => {
    if (command.type === 'CREATE_ACCOUNT') {
      // The account already exists here; executing the record would insert
      // its author's account instead. Only the name and initials are taken.
      const { name, initials } = command.payload;
      if (!name && !initials) return;

      // A failed rename must not escape. The sync engine rethrows a failed
      // replay and only advances its cursor once a record succeeds, so the
      // pull would abort on the account's first record and deliver nothing.
      try {
        const applied = await service.applyRemoteAccountName(localAccountId, {
          name,
          initials,
        });
        if (!applied) {
          // Typically a member whose own default account is called "Personal"
          // just like the owner's (#484).
          console.warn(
            '[replay] Account name from CREATE_ACCOUNT not applied to',
            localAccountId,
          );
        }
      } catch (err) {
        console.warn('[replay] Failed to apply account name from CREATE_ACCOUNT', err);
      }
      return;
    }

    await service.executeCommand(retarget(command, localAccountId));
  };
}
