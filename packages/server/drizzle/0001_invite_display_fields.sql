-- Add denormalised display fields to the invites table so that the recipient
-- can see the inviter's name and the account name without an extra join that
-- the server cannot do (email addresses are never stored in plaintext).
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "sender_name" text;
ALTER TABLE "invites" ADD COLUMN IF NOT EXISTS "account_name" text;
