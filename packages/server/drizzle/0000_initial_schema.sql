CREATE TABLE IF NOT EXISTS "account_keys" (
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"wrapped_key" jsonb NOT NULL,
	"epoch" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "account_keys_pkey" PRIMARY KEY("account_id","user_id","epoch"),
	CONSTRAINT "account_keys_epoch_check" CHECK ("account_keys"."epoch" >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_members" (
	"account_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"display_email" text,
	"role" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_members_pkey" PRIMARY KEY("account_id","user_id"),
	CONSTRAINT "account_members_role_check" CHECK ("account_members"."role" IN ('owner', 'member'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"key_epoch" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_key_epoch_check" CHECK ("accounts"."key_epoch" >= 1)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "change_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"sequence" bigserial NOT NULL,
	"encrypted_payload" jsonb NOT NULL,
	"change_uuid" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "change_records_change_uuid_key" UNIQUE("change_uuid"),
	CONSTRAINT "change_records_account_sequence_key" UNIQUE("account_id","sequence")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sender_user_id" uuid NOT NULL,
	"recipient_email" text,
	"recipient_email_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "invites_status_check" CHECK ("invites"."status" IN ('pending', 'accepted', 'declined', 'revoked')),
	CONSTRAINT "invites_recipient_email_hash_length_check" CHECK (length("invites"."recipient_email_hash") = 64)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"public_key" text NOT NULL,
	"validated_at" timestamp with time zone,
	"magic_link_used_at" timestamp with time zone,
	"registration_code_hash" text,
	"registration_code_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "email_hash_length_check" CHECK (length("users"."email_hash") = 64),
	CONSTRAINT "public_key_length_check" CHECK (length("users"."public_key") = 43)
);
--> statement-breakpoint
ALTER TABLE "account_keys" ADD CONSTRAINT "account_keys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_keys" ADD CONSTRAINT "account_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_members" ADD CONSTRAINT "account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_records" ADD CONSTRAINT "change_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_sender_user_id_users_id_fk" FOREIGN KEY ("sender_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_keys_user_account_idx" ON "account_keys" USING btree ("user_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_owner_user_id_idx" ON "accounts" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "invites_pending_by_recipient_idx" ON "invites" USING btree ("recipient_email_hash") WHERE "invites"."status" = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "invites_pending_account_recipient_unique_idx" ON "invites" USING btree ("account_id","recipient_email_hash") WHERE "invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "users_created_at_unvalidated_idx" ON "users" USING btree ("created_at") WHERE "users"."validated_at" IS NULL;--> statement-breakpoint
INSERT INTO account_members (account_id, user_id, role, joined_at)
SELECT id, owner_user_id, 'owner', created_at
FROM accounts
ON CONFLICT (account_id, user_id) DO NOTHING;