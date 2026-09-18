export {
  REMEDIATION_DONE_FLAG_KEY,
  runDuplicateMigrationRemediation,
  runDuplicateMigrationRemediationAndAct,
  purgeArchivedOlderThan,
  isRemediationDone,
  markRemediationDone,
  isRemediationInProgress,
  markRemediationInProgress,
  clearRemediationInProgress,
  type DuplicateMatch,
  type RemediationResult,
} from './duplicate-migration-remediation.js';

export {
  RESTORE_DUPLICATE_REMEDIATION_DONE_FLAG_KEY,
  runRestoreDuplicateCategoryRemediation,
  isRestoreDuplicateRemediationDone,
  markRestoreDuplicateRemediationDone,
  type RestoreDuplicateRemediationResult,
  type RestoreDuplicateRemediationAccountResult,
} from './restore-duplicate-category-remediation.js';
