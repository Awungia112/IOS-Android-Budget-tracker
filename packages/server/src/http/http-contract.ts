export const HTTP_STATUS = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  conflict: 409,
  tooManyRequests: 429,
  internalServerError: 500,
} as const;

export const ERROR_CODES = {
  unauthorized: 'unauthorized',
  invalidPublicKey: 'invalid_public_key',
  alreadyValidated: 'already_validated',
  registrationFailed: 'registration_failed',
  tokenExpired: 'token_expired',
  invalidToken: 'invalid_token',
  userNotFound: 'user_not_found',
  tokenInvalidForCurrentKey: 'token_invalid_for_current_key',
  tokenAlreadyUsed: 'token_already_used',
  internalError: 'internal_error',
  accountNotFound: 'account_not_found',
  accountKeyNotFound: 'account_key_not_found',
  accountCreateFailed: 'account_create_failed',
  changeUuidConflict: 'change_uuid_conflict',
  changeRecordPushFailed: 'change_record_push_failed',
  forbidden: 'forbidden',
  conflict: 'conflict',
  memberNotFound: 'member_not_found',
  cannotRemoveOwner: 'cannot_remove_owner',
  nonMember: 'non_member',
  inviteNotFound: 'invite_not_found',
  inviteAlreadyResponded: 'invite_already_responded',
  inviteNotAccepted: 'invite_not_accepted',
  alreadyMember: 'already_member',
  alreadyInvited: 'already_invited',
  cannotInviteSelf: 'cannot_invite_self',
  emailNotRegistered: 'email_not_registered',
  userDeletionFailed: 'user_deletion_failed',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export interface ErrorResponse {
  error: ErrorCode;
}

export const UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

export const ERROR_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['error'],
  properties: { error: { type: 'string' } },
} as const;

export const OPAQUE_JSON_OBJECT_SCHEMA = {
  type: 'object',
  additionalProperties: true,
} as const;
