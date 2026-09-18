import { randomBytes } from 'node:crypto';

import { and, eq, gt, lte } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';

import type { Db } from '../db/client.js';
import { nonces } from '../db/schema.js';
import { NONCE_SWEEP_INTERVAL_MS, NONCE_TTL_MS, type NonceResponse } from './replay-protection-contract.js';

export interface NonceStore {
  issue(now?: number): Promise<NonceResponse>;
  consumeIfUsable(nonce: string, now?: number): Promise<boolean>;
  close(): Promise<void>;
}

function generateNonce(now: number): { nonce: string; expiresAt: number } {
  return {
    nonce: randomBytes(16).toString('base64url'),
    expiresAt: now + NONCE_TTL_MS,
  };
}

/**
 * Nonce store backed by the shared PostgreSQL database.
 *
 * Production runs multiple server replicas behind a load balancer, so the
 * nonce issued by one replica must be consumable by any other. Single-use
 * semantics are enforced by the atomic DELETE ... RETURNING: when two
 * requests race on the same nonce, PostgreSQL guarantees only one delete
 * returns the row.
 *
 * Every replica runs the expiry sweep; the deletes are idempotent so
 * overlapping sweeps are harmless.
 */
export class DbNonceStore implements NonceStore {
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(
    private readonly db: Db,
    private readonly log?: FastifyBaseLogger,
    sweepIntervalMs: number = NONCE_SWEEP_INTERVAL_MS,
  ) {
    this.sweepTimer = setInterval(() => {
      void this.sweep(Date.now());
    }, sweepIntervalMs);
    this.sweepTimer.unref();
  }

  async issue(now: number = Date.now()): Promise<NonceResponse> {
    const { nonce, expiresAt } = generateNonce(now);
    await this.db.insert(nonces).values({ nonce, expiresAt: new Date(expiresAt) });

    return {
      nonce,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  async consumeIfUsable(nonce: string, now: number = Date.now()): Promise<boolean> {
    const consumed = await this.db
      .delete(nonces)
      .where(and(eq(nonces.nonce, nonce), gt(nonces.expiresAt, new Date(now))))
      .returning({ nonce: nonces.nonce });

    return consumed.length > 0;
  }

  async close(): Promise<void> {
    clearInterval(this.sweepTimer);
  }

  private async sweep(now: number): Promise<void> {
    try {
      await this.db.delete(nonces).where(lte(nonces.expiresAt, new Date(now)));
    } catch (err) {
      this.log?.error(err, 'nonce-sweep: failed');
    }
  }
}

interface NonceRecord {
  expiresAt: number;
}

export class InMemoryNonceStore implements NonceStore {
  private readonly nonces = new Map<string, NonceRecord>();
  private readonly sweepTimer: NodeJS.Timeout;

  constructor(private readonly sweepIntervalMs: number = NONCE_SWEEP_INTERVAL_MS) {
    this.sweepTimer = setInterval(() => {
      this.sweep(Date.now());
    }, this.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  async issue(now: number = Date.now()): Promise<NonceResponse> {
    const { nonce, expiresAt } = generateNonce(now);
    this.nonces.set(nonce, { expiresAt });

    return {
      nonce,
      expires_at: new Date(expiresAt).toISOString(),
    };
  }

  async consumeIfUsable(nonce: string, now: number = Date.now()): Promise<boolean> {
    const record = this.nonces.get(nonce);
    if (!record) return false;

    this.nonces.delete(nonce);
    return record.expiresAt > now;
  }

  async close(): Promise<void> {
    clearInterval(this.sweepTimer);
  }

  private sweep(now: number = Date.now()): void {
    for (const [nonce, record] of this.nonces) {
      if (record.expiresAt <= now) {
        this.nonces.delete(nonce);
      }
    }
  }
}
