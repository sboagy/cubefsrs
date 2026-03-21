/**
 * fsrs-test-config.ts
 *
 * FSRS scheduling parameter overrides for deterministic E2E tests.
 *
 * The default FSRS parameters are tuned for real-world memory curves and
 * produce non-deterministic intervals that make test assertions fragile.
 * These overrides produce very short, predictable intervals that let tests
 * simulate multi-day progression in a few seconds of real time (with the
 * Playwright clock frozen at the expected future date).
 *
 * Usage (in a test's beforeEach or directly in `setupForPracticeTestsParallel`):
 * ```typescript
 * await page.evaluate(
 *   (params) => window.__cfTestApi?.setFsrsParams(params),
 *   FSRS_TEST_PARAMS,
 * );
 * ```
 */

import { generatorParameters } from "ts-fsrs";

/**
 * Minimal FSRS parameter set for deterministic test scheduling.
 * - Short initial stability keeps intervals ≤ a few days after first review.
 * - Flat difficulty factors eliminate variance from hard/easy ratings.
 * - Aggressive forgetting curve ensures cards become "due" quickly when the
 *   Playwright clock is advanced by even a single day.
 */
export const FSRS_TEST_PARAMS = generatorParameters({
	enable_fuzz: false,
	// Minimum stability values so the first Good rating produces a ~1-day interval
	w: [
		0.4, 0.6, 2.4, 5.8, 4.93, 0.94, 0.86, 0.01, 1.49, 0.14, 1.0, 1.96, 1.13,
		0.28, 0.28, 2.18, 0.28, 0.28, 0.28,
	],
	request_retention: 0.9,
	maximum_interval: 36500,
});

/**
 * A "due yesterday" offset constant to use with `seedFsrsCardState`.
 * Seeding with `dueOffsetDays: DUE_YESTERDAY` makes the card immediately due.
 */
export const DUE_YESTERDAY = -1;

/**
 * A "due in the future" offset for cards that should NOT be due yet.
 */
export const DUE_TOMORROW = 1;

/**
 * Convenience: days after `setStableDate` to trigger a second review.
 * Cards graded Good at stability ~1 are due again after ~1 day, so advancing
 * by `NEXT_REVIEW_DAYS` plus a safety margin covers the expected window.
 */
export const NEXT_REVIEW_DAYS = 2;
