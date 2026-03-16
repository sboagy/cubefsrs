CREATE TABLE `sync_push_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`table_name` text NOT NULL,
	`row_id` text NOT NULL,
	`operation` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`changed_at` text NOT NULL,
	`synced_at` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `idx_push_queue_status_changed` ON `sync_push_queue` (`status`,`changed_at`);--> statement-breakpoint
CREATE INDEX `idx_push_queue_table_row` ON `sync_push_queue` (`table_name`,`row_id`);--> statement-breakpoint
CREATE TABLE `alg_case` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`subset_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`alg` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text,
	`updated_at` text,
	FOREIGN KEY (`subset_id`) REFERENCES `alg_subset`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_case_slug_user_id_key` ON `alg_case` (`slug`,`user_id`);--> statement-breakpoint
CREATE TABLE `alg_category` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_category_slug_user_id_key` ON `alg_category` (`slug`,`user_id`);--> statement-breakpoint
CREATE TABLE `alg_subset` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`category_id` text NOT NULL,
	`user_id` text,
	`name` text NOT NULL,
	`sort_order` integer DEFAULT 0,
	FOREIGN KEY (`category_id`) REFERENCES `alg_category`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_subset_slug_user_id_key` ON `alg_subset` (`slug`,`user_id`);--> statement-breakpoint
CREATE TABLE `fsrs_card_state` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`due` integer NOT NULL,
	`stability` real,
	`difficulty` real,
	`elapsed_days` integer,
	`scheduled_days` integer,
	`reps` integer DEFAULT 0,
	`lapses` integer DEFAULT 0,
	`state` integer DEFAULT 0,
	`last_review` integer,
	`updated_at` text,
	FOREIGN KEY (`case_id`) REFERENCES `alg_case`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fsrs_card_state_user_id_case_id_key` ON `fsrs_card_state` (`user_id`,`case_id`);--> statement-breakpoint
CREATE TABLE `practice_time_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`ms` integer NOT NULL,
	`reviewed_at` text,
	FOREIGN KEY (`case_id`) REFERENCES `alg_case`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_alg_annotation` (
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`recognition` text,
	`mnemonic` text,
	`notes` text,
	`updated_at` text,
	PRIMARY KEY(`user_id`, `case_id`),
	FOREIGN KEY (`case_id`) REFERENCES `alg_case`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_alg_selection` (
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `case_id`),
	FOREIGN KEY (`case_id`) REFERENCES `alg_case`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`current_category_id` text,
	`current_case_id` text,
	`order_mode` text DEFAULT 'fsrs',
	`lib_options` text,
	`fsrs_params` text,
	`practice_time_limit` integer,
	`updated_at` text,
	FOREIGN KEY (`current_category_id`) REFERENCES `alg_category`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_case_id`) REFERENCES `alg_case`(`id`) ON UPDATE no action ON DELETE no action
);
