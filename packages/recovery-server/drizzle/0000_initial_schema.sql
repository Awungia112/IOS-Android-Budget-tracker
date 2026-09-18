CREATE TABLE "recovery_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_hash" text NOT NULL,
	"encrypted_private_key" jsonb NOT NULL,
	"tmp_code_hash" text,
	"code_expires_at" timestamp with time zone,
	"code_used_at" timestamp with time zone,
	"verify_attempts" integer DEFAULT 0 NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"request_window_start" timestamp with time zone,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recovery_entries_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "code_expires_at_after_enrolled_at" CHECK ("recovery_entries"."code_expires_at" IS NULL OR "recovery_entries"."code_expires_at" > "recovery_entries"."enrolled_at"),
	CONSTRAINT "tmp_code_hash_is_argon2id" CHECK ("recovery_entries"."tmp_code_hash" IS NULL OR "recovery_entries"."tmp_code_hash" LIKE '$argon2id$%')
);
