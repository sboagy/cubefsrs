/**
 * clock-control.ts
 *
 * Playwright clock utilities for FSRS time-sensitive E2E tests.
 * Adapted from TuneTrees' `e2e/helpers/clock-control.ts`.
 *
 * @see https://playwright.dev/docs/clock
 */

import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Default clock tolerance for time comparisons.
 * CI environments can exhibit multi-second scheduling delays.
 */
export const CLOCK_TOLERANCE_MS = 18000;

/**
 * Return appropriate clock tolerance, raising it for mobile browsers.
 */
export function getClockTolerance(
	projectName?: string,
	baseToleranceMs = CLOCK_TOLERANCE_MS,
): number {
	if (projectName && /Mobile/i.test(projectName)) {
		return Math.max(baseToleranceMs, 5000);
	}
	return baseToleranceMs;
}

/**
 * Compare two ISO date strings within tolerance.
 */
export function expectIsoClose(
	actualIso: string,
	expectedIso: string,
	projectName?: string,
	baseToleranceMs = 25,
): void {
	const toleranceMs = getClockTolerance(projectName, baseToleranceMs);
	const diff = Math.abs(
		new Date(actualIso).getTime() - new Date(expectedIso).getTime(),
	);
	expect(diff).toBeLessThanOrEqual(toleranceMs);
}

/**
 * Compare two Date objects within tolerance.
 */
export function expectDateClose(
	actual: Date,
	expected: Date,
	projectName?: string,
	baseToleranceMs = 25,
): void {
	expectIsoClose(
		actual.toISOString(),
		expected.toISOString(),
		projectName,
		baseToleranceMs,
	);
}

/**
 * Freeze the browser clock at a given time.
 *
 * @example
 * ```typescript
 * await setStableDate(context, '2025-07-20T14:00:00.000Z');
 * ```
 */
export async function setStableDate(
	context: BrowserContext,
	date: Date | string,
): Promise<void> {
	const timestamp = typeof date === "string" ? new Date(date) : date;
	await context.clock.install({ time: timestamp });
}

/**
 * Advance the frozen clock by `days` days from `baseDate`.
 *
 * @param baseDate - Must be supplied explicitly (current frozen time is not
 *   automatically queried to avoid a page dependency here).
 */
export async function advanceDays(
	context: BrowserContext,
	days: number,
	baseDate: Date,
): Promise<Date> {
	const newDate = new Date(baseDate);
	newDate.setDate(newDate.getDate() + days);
	await context.clock.install({ time: newDate });
	return newDate;
}

/**
 * Advance the frozen clock by `hours` hours from `baseDate`.
 */
export async function advanceHours(
	context: BrowserContext,
	hours: number,
	baseDate: Date,
): Promise<Date> {
	const newDate = new Date(baseDate);
	newDate.setHours(newDate.getHours() + hours);
	await context.clock.install({ time: newDate });
	return newDate;
}

/**
 * Return the current `Date` as seen by browser code.
 */
export async function getCurrentDate(page: Page): Promise<Date> {
	const isoString = await page.evaluate(() => new Date().toISOString());
	return new Date(isoString);
}

/**
 * Assert the browser clock is frozen at `expectedDate` (within tolerance).
 */
export async function verifyClockFrozen(
	page: Page,
	expectedDate: Date,
	toleranceMs?: number,
	projectName?: string,
): Promise<void> {
	const browserDate = await getCurrentDate(page);
	const actualTolerance = toleranceMs ?? getClockTolerance(projectName);
	const diff = Math.abs(browserDate.getTime() - expectedDate.getTime());

	if (diff > actualTolerance) {
		throw new Error(
			`Clock verification failed: expected ${expectedDate.toISOString()}, ` +
				`got ${browserDate.toISOString()} (diff: ${diff}ms, tolerance: ${actualTolerance}ms)`,
		);
	}
}

/**
 * Stable, deterministic anchor date for scheduling tests.
 */
export const STANDARD_TEST_DATE = "2025-07-20T14:00:00.000Z";

/**
 * Create a Date offset from `STANDARD_TEST_DATE`.
 *
 * @example
 * ```typescript
 * const tomorrow = getTestDate(1); // 2025-07-21T14:00:00Z
 * ```
 */
export function getTestDate(daysOffset = 0): Date {
	const baseDate = new Date(STANDARD_TEST_DATE);
	baseDate.setDate(baseDate.getDate() + daysOffset);
	return baseDate;
}

/**
 * Simulate a multi-day scenario: for each day, freeze the clock, call the
 * callback, then advance by one day.
 *
 * @example
 * ```typescript
 * await simulateMultiDayScenario(context, getTestDate(), 3, async (date, i) => {
 *   await page.goto('/');
 *   // practice …
 * });
 * ```
 */
export async function simulateMultiDayScenario(
	context: BrowserContext,
	startDate: Date,
	dayCount: number,
	onEachDay: (currentDate: Date, dayIndex: number) => Promise<void>,
): Promise<void> {
	let currentDate = new Date(startDate);

	for (let day = 0; day < dayCount; day++) {
		await context.clock.install({ time: currentDate });
		await onEachDay(currentDate, day);

		currentDate = new Date(currentDate);
		currentDate.setDate(currentDate.getDate() + 1);
	}
}
