export interface Account {
  id: string;
  name: string;
  initials: string;
  profileImage?: string;
  /** Flag indicating if this migrated account needs to be pushed to the online server */
  needsOnlinePush?: boolean;
}

export type CreateAccount = Omit<Account, 'id'>;
