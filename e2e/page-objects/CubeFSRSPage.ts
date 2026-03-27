/**
 * e2e/page-objects/CubeFSRSPage.ts
 *
 * Page Object Model for the CubeFSRS application.
 *
 * Locator strategy:
 *  - Structural selectors (id, role, text) are used where no `data-testid`
 *    exists yet.  Once Rhizome ships `data-testid` attributes on LoginPage
 *    and DbStatusDropdown, these can be updated to `data-testid` selectors.
 *  - Library view selectors model the current UI on disk: a category
 *    `<select>`, subset checkboxes, ordering-strategy radio inputs, and per-
 *    case `Enabled` checkboxes / `Review Now` buttons.  These do NOT model
 *    TuneTrees-specific controls (clickable category list, strategy `<select>`,
 *    selected-count badge).
 *
 * @see plan-cubeFsrsTests.prompt.md — "Phase 3 › CubeFSRSPage.ts"
 */

import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { BASE_URL } from "../test-config";

export class CubeFSRSPage {
	readonly page: Page;

	constructor(page: Page) {
		this.page = page;
	}

	// ── Sidebar nav ───────────────────────────────────────────────────────────

	/** Sidebar link to the Practice view (`/`) */
	get practiceLink(): Locator {
		return this.page.getByRole("link", { name: "Practice", exact: true });
	}

	/** Sidebar link to the Alg Library view (`/library`) */
	get libraryLink(): Locator {
		return this.page.getByRole("link", { name: "Alg Library", exact: true });
	}

	/** Sidebar link to the New Alg view (`/new`) */
	get newAlgLink(): Locator {
		return this.page.getByRole("link", { name: "New Alg", exact: true });
	}

	/** Sidebar link to the Options view (`/options`) */
	get optionsLink(): Locator {
		return this.page.getByRole("link", { name: "Options", exact: true });
	}

	/** Device connect/disconnect button */
	get deviceConnectButton(): Locator {
		// The button text alternates between "Connect", "Disconnect", "Connecting…"
		return this.page.locator(
			'button:text-matches("Connect|Disconnect|Connecting")',
		);
	}

	/**
	 * User menu trigger button (avatar + email in sidebar).
	 * Click to reveal the sign-out option.
	 */
	get userMenuButton(): Locator {
		return this.page.getByRole("button", { name: "User menu" });
	}

	/** Sign Out button — visible after opening the user menu. */
	get signOutButton(): Locator {
		return this.page.getByRole("button", { name: "Sign Out" });
	}

	// ── Auth (Rhizome LoginPage) ──────────────────────────────────────────────

	/**
	 * Email input on the login page.
	 * Uses id selector until Rhizome adds `data-testid="login-email-input"`.
	 */
	get emailInput(): Locator {
		return this.page.locator("#login-email");
	}

	/**
	 * Password input on the login page.
	 * Uses id selector until Rhizome adds `data-testid="login-password-input"`.
	 */
	get passwordInput(): Locator {
		return this.page.locator("#login-password");
	}

	/**
	 * Sign In submit button on the login page.
	 * Uses role/name until Rhizome adds `data-testid="login-submit-button"`.
	 */
	get signInButton(): Locator {
		return this.page.getByRole("button", { name: "Sign In" });
	}

	/**
	 * "Use on this Device Only" (anonymous sign-in) button.
	 * Uses text until Rhizome adds `data-testid="login-anonymous-button"`.
	 */
	get anonymousButton(): Locator {
		return this.page.getByRole("button", { name: /Device Only/i });
	}

	// ── PracticeView ─────────────────────────────────────────────────────────

	/** Empty-state message shown when no FSRS cards are due. */
	get emptyStateMessage(): Locator {
		return this.page.getByText("No Cases Scheduled", { exact: true });
	}

	/**
	 * Practice content that indicates the main view has finished rendering.
	 * This is either the empty-state banner or an algorithm row when a due card exists.
	 */
	get practiceContent(): Locator {
		return this.emptyStateMessage.or(this.algorithmText).first();
	}

	/**
	 * The algorithm text span in PracticeView.
	 * Contains move notation like `R U R' U'`.
	 */
	get algorithmText(): Locator {
		return this.page.locator("span.font-mono.whitespace-pre");
	}

	/**
	 * The TwistyPlayer stub div rendered in test mode.
	 * Uses the `data-testid` attribute set by `createTwistyPlayerMount`.
	 */
	get cubeViewerStub(): Locator {
		return this.page.locator('[data-testid="twisty-player-stub"]');
	}

	/** Grade bar "Again" button (rating 1) */
	get gradeBarAgain(): Locator {
		return this.page.getByRole("button", { name: "Again", exact: true });
	}

	/** Grade bar "Hard" button (rating 2) */
	get gradeBarHard(): Locator {
		return this.page.getByRole("button", { name: "Hard", exact: true });
	}

	/** Grade bar "Good" button (rating 3) */
	get gradeBarGood(): Locator {
		return this.page.getByRole("button", { name: "Good", exact: true });
	}

	/** Grade bar "Easy" button (rating 4) */
	get gradeBarEasy(): Locator {
		return this.page.getByRole("button", { name: "Easy", exact: true });
	}

	// ── LibraryView ───────────────────────────────────────────────────────────

	/**
	 * Category `<select>` in the library header.
	 * Use `.selectOption(name)` to change the active category.
	 */
	get categorySelect(): Locator {
		return this.page.locator("#category-select");
	}

	/**
	 * Subset checkbox by subset name (e.g. `"T-Shape"`).
	 * Returns the checkbox `<input>` element (not the label).
	 */
	subsetCheckbox(name: string): Locator {
		// Each subset row is:  <label><input type=checkbox /><span>name</span></label>
		return this.page
			.locator("label")
			.filter({ hasText: name })
			.locator('input[type="checkbox"]')
			.first();
	}

	/**
	 * Ordering strategy radio button by strategy value or label text.
	 *
	 * Available values: `"fsrs"` | `"random"` | `"slowFirst"` | `"prioritizeFailed"` | `"sequential"`
	 * Available labels: `"Spaced Repetition (FSRS)"`, `"Random"`, `"Slow Cases First"`, etc.
	 */
	orderingStrategyRadio(nameOrValue: string): Locator {
		// Try by id first (format: `strategy-<value>`)
		const byId = this.page.locator(`#strategy-${nameOrValue}`);
		const byName = this.page
			.locator('input[name="ordering-strategy"]')
			.filter({ has: this.page.locator(`[value="${nameOrValue}"]`) });

		// Use first matching label text as fallback
		const byLabel = this.page
			.locator("label")
			.filter({ hasText: nameOrValue })
			.locator('input[type="radio"]')
			.first();

		// Compose: return the most specific selector that exists
		return byId.or(byName).or(byLabel).first();
	}

	/**
	 * Case tile container div for a given case.
	 *
	 * @param idOrAlg - The case UUID (matches the data-title alg attribute)
	 *   or the case name in the `CaseThumb`.
	 */
	caseTile(idOrName: string): Locator {
		// The tile div has `title={alg}` (the algorithm text), so we match by
		// containing either a Review Now button for that case, or by name.
		// The most reliable anchor is the inner CaseThumb which shows the name.
		return this.page
			.locator("div")
			.filter({ hasText: idOrName })
			.filter({ has: this.page.getByRole("button", { name: "Review Now" }) })
			.first();
	}

	/**
	 * The "Enabled" checkbox for a case tile identified by case name.
	 *
	 * The checkbox label text is "Enabled" and appears inside the tile for
	 * each case.
	 */
	caseEnabledCheckbox(idOrName: string): Locator {
		return this.caseTile(idOrName)
			.locator("label")
			.filter({ hasText: "Enabled" })
			.locator('input[type="checkbox"]')
			.first();
	}

	/**
	 * The "Review Now" button for a specific case tile.
	 */
	reviewNowButton(idOrName: string): Locator {
		return this.caseTile(idOrName).getByRole("button", {
			name: "Review Now",
			exact: true,
		});
	}

	// ── DbStatus (Rhizome DbStatusDropdown) ──────────────────────────────────

	/**
	 * DbStatus trigger button in the sidebar.
	 * Uses `data-testid="db-status-trigger"` once Phase 8 Rhizome changes land;
	 * falls back to aria-label until then.
	 */
	get dbStatusButton(): Locator {
		return this.page
			.locator('[data-testid="db-status-trigger"]')
			.or(this.page.getByRole("button", { name: /sync|db status/i }))
			.first();
	}

	/**
	 * DbStatus text span inside the dropdown.
	 * Uses `data-testid="db-status-text"` once Phase 8 Rhizome changes land.
	 */
	get dbStatusText(): Locator {
		return this.page
			.locator('[data-testid="db-status-text"]')
			.or(this.page.locator(".db-status-text"))
			.first();
	}

	// ── Helpers ───────────────────────────────────────────────────────────────

	/** Navigate to the app root and wait for the Practice view heading. */
	async waitForHome(): Promise<void> {
		await this.page.goto(`${BASE_URL}/`);
		await this.page.waitForURL(/\/$/, { timeout: 10_000 });
		await expect(
			this.page.getByRole("heading", { name: "Practice" }),
		).toBeVisible({
			timeout: 10_000,
		});
	}

	/** Navigate to `/library` and wait for the heading. */
	async navigateToLibrary(): Promise<void> {
		await this.page.goto(`${BASE_URL}/library`);
		await expect(
			this.page.getByRole("heading", { name: "Algorithm Library" }),
		).toBeVisible({
			timeout: 10_000,
		});
	}

	/** Navigate to `/` and wait for the practice heading. */
	async navigateToPractice(): Promise<void> {
		await this.page.goto(`${BASE_URL}/`);
		await expect(
			this.page.getByRole("heading", { name: "Practice" }),
		).toBeVisible({
			timeout: 10_000,
		});
	}

	/** Wait for the Practice view to render either an empty state or an algorithm. */
	async waitForPracticeContent(timeout = 10_000): Promise<void> {
		await expect(
			this.page.getByRole("heading", { name: "Practice" }),
		).toBeVisible({ timeout });
		await expect(this.practiceContent).toBeVisible({ timeout });
	}

	/**
	 * Sign in via the login form.
	 *
	 * Waits for the URL to leave `/login` after clicking Sign In.
	 */
	async signIn(email: string, password: string): Promise<void> {
		await this.page.goto(`${BASE_URL}/login`);
		await this.emailInput.fill(email);
		await this.passwordInput.fill(password);
		await this.signInButton.click();
		await this.page.waitForURL((url) => !url.pathname.includes("/login"), {
			timeout: 15_000,
		});
	}
}
