/**
 * e2e/tests/practice-003-grading.spec.ts
 *
 * Verify that clicking each grade button (Again, Hard, Good, Easy) in the
 * Practice view advances the FSRS card and updates the practice queue.
 *
 * We test each grade button in a separate `test` block, each with its own
 * fresh card seed, to avoid cross-test FSRS state contamination.
 */

import { expect } from "@playwright/test";
import { CATALOG_CASE_PLL_T_PERM_ID } from "../../tests/fixtures/test-data";
import {
	getCfTestApi,
	setupForPracticeTestsParallel,
} from "../helpers/alg-scenarios";
import { test as cfTest } from "../helpers/test-fixture";
import { CubeFSRSPage } from "../page-objects/CubeFSRSPage";

/** Seed 1 due card and navigate to the practice view. */
async function seedOneDueCard({
	page,
	testUser,
}: {
	page: Parameters<typeof getCfTestApi>[0];
	testUser: Awaited<
		ReturnType<
			typeof import("../helpers/test-users")["getTestUserByWorkerIndex"]
		>
	>;
}) {
	await setupForPracticeTestsParallel(page, testUser, {
		dueCards: [{ caseId: CATALOG_CASE_PLL_T_PERM_ID, dueOffsetDays: -1 }],
	});
}

async function gradeSingleDueCardAndAssertDequeued({
	page,
	gradeButton,
	cfPage,
}: {
	page: Parameters<typeof getCfTestApi>[0];
	gradeButton: CubeFSRSPage["gradeBarAgain"];
	cfPage: CubeFSRSPage;
}) {
	const api = await getCfTestApi(page);
	await expect.poll(() => api.getPracticeQueueCount()).toBe(1);

	await gradeButton.click();

	await expect.poll(() => api.getPracticeQueueCount()).toBe(0);
	await expect(cfPage.emptyStateMessage).toBeVisible({ timeout: 10_000 });
}

cfTest.describe("practice-003: grading", () => {
	cfTest("clicking Again advances the card", async ({ page, testUser }) => {
		const cfPage = new CubeFSRSPage(page);
		await seedOneDueCard({ page, testUser });

		await expect(cfPage.gradeBarAgain).toBeVisible({ timeout: 10_000 });
		await gradeSingleDueCardAndAssertDequeued({
			page,
			gradeButton: cfPage.gradeBarAgain,
			cfPage,
		});
	});

	cfTest("clicking Good advances the card", async ({ page, testUser }) => {
		const cfPage = new CubeFSRSPage(page);
		await seedOneDueCard({ page, testUser });

		await expect(cfPage.gradeBarGood).toBeVisible({ timeout: 10_000 });
		await gradeSingleDueCardAndAssertDequeued({
			page,
			gradeButton: cfPage.gradeBarGood,
			cfPage,
		});
	});

	cfTest("clicking Easy advances the card", async ({ page, testUser }) => {
		const cfPage = new CubeFSRSPage(page);
		await seedOneDueCard({ page, testUser });

		await expect(cfPage.gradeBarEasy).toBeVisible({ timeout: 10_000 });
		await gradeSingleDueCardAndAssertDequeued({
			page,
			gradeButton: cfPage.gradeBarEasy,
			cfPage,
		});
	});

	cfTest("clicking Hard advances the card", async ({ page, testUser }) => {
		const cfPage = new CubeFSRSPage(page);
		await seedOneDueCard({ page, testUser });

		await expect(cfPage.gradeBarHard).toBeVisible({ timeout: 10_000 });
		await gradeSingleDueCardAndAssertDequeued({
			page,
			gradeButton: cfPage.gradeBarHard,
			cfPage,
		});
	});
});
