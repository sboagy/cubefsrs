-- Add oosync metadata columns to every syncable table so browser SQLite
-- matches the generated schema used by the runtime and E2E helpers.
--> statement-breakpoint

ALTER TABLE `alg_case` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `alg_case` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `alg_case` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `alg_category` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `alg_category` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `alg_category` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `alg_subset` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `alg_subset` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `alg_subset` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `fsrs_card_state` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `fsrs_card_state` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `fsrs_card_state` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `practice_time_entry` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `practice_time_entry` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `practice_time_entry` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `user_alg_annotation` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_alg_annotation` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_alg_annotation` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `user_alg_selection` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_alg_selection` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_alg_selection` ADD COLUMN `device_id` text;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `sync_version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `last_modified_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;
--> statement-breakpoint
ALTER TABLE `user_settings` ADD COLUMN `device_id` text;