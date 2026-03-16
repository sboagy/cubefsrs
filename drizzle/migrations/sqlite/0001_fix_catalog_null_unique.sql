-- Fix: Replace composite UNIQUE(slug, user_id) indexes on catalog tables with
-- partial unique indexes that correctly enforce uniqueness for global rows
-- (user_id IS NULL).
--
-- SQLite treats NULL as distinct from all other NULLs in a regular UNIQUE
-- index, which means UNIQUE(slug, user_id) allows unlimited duplicate global
-- rows with the same slug.  Partial indexes avoid this by providing a
-- separate index for global rows (WHERE user_id IS NULL) and user-owned rows
-- (WHERE user_id IS NOT NULL).

--> statement-breakpoint
DROP INDEX IF EXISTS `alg_category_slug_user_id_key`;
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_category_slug_user_id_key` ON `alg_category` (`slug`, `user_id`) WHERE `user_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_category_slug_global_key`  ON `alg_category` (`slug`) WHERE `user_id` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `alg_subset_slug_user_id_key`;
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_subset_slug_user_id_key` ON `alg_subset` (`slug`, `user_id`) WHERE `user_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_subset_slug_global_key`  ON `alg_subset` (`slug`) WHERE `user_id` IS NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS `alg_case_slug_user_id_key`;
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_case_slug_user_id_key` ON `alg_case` (`slug`, `user_id`) WHERE `user_id` IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX `alg_case_slug_global_key`  ON `alg_case` (`slug`) WHERE `user_id` IS NULL;
