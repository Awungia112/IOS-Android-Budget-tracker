export interface AccountSyncMetadata {
  localAccountId: string;
  serverAccountId: string;
  keyEpoch: number;
  /** The last pulled sequence number from the server, used as the cursor for the next pull */
  lastSyncSequence?: number;
  /** The user's role for this account ('owner' or 'member'). Used to skip irrelevant operations during sync. */
  role?: 'owner' | 'member';
  createdAt: string;
  updatedAt: string;
}

export interface RemoteReplayRecord {
  changeUuid: string;
  serverAccountId: string;
  localAccountId: string;
  sequence: number;
  replayedAt: string;
}
