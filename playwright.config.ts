import path, { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local for local development (optional, won't fail in CI)
config({ path: resolve(__dirname, ".env.local") });

const DEV_PORT = 5174;
const WORKER_PORT = 8797;
const PREVIEW_PORT = 4174; // Port for the PWA preview/production build

export default defineConfig({
	testDir: "./e2e",
	testMatch: /.*\.spec\.ts/,
	outputDir: path.resolve(__dirname, "test-results"),
	// Parallel is fine within tests but auth setup must be serial across the run
	fullyParallel: false,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 3 : 0,
	// Per-test timeout: must exceed the 20s waitForFunction used by seeded
	// setup in E2E helpers.
	timeout: process.env.PWDEBUG ? 300_000 : 30_000,
	// Up to 8 workers locally (one per test user); 2 in CI to limit resource usage
	workers: process.env.CI ? 2 : 8,
	reporter: process.env.CI ? [["blob"], ["list"]] : [["list"]],
	expect: {
		timeout: process.env.PWDEBUG ? 300_000 : 5_000,
	},
	use: {
		baseURL: `http://localhost:${DEV_PORT}/`,
		trace: "retain-on-failure",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
	},
	globalTimeout:
		process.env.CI || process.env.PWDEBUG ? 60 * 60 * 1000 : undefined,
	projects: [
		// Auth/setup project: runs auth.setup.ts before any test project with dependencies: ["setup"]
		{ name: "setup", testDir: "./e2e/setup", testMatch: /.*\.setup\.ts$/ },

		// Preview-setup: same auth flow as setup, but with the preview-build baseURL.
		// Used only by chromium-pwa-offline to authenticate against the built bundle.
		{
			name: "preview-setup",
			testDir: "./e2e/setup",
			testMatch: /.*\.setup\.ts$/,
			use: {
				baseURL: `http://localhost:${PREVIEW_PORT}`,
			},
		},
		// Auth tests: no stored auth state (the test itself logs in)
		{
			name: "chromium-auth",
			testDir: "./e2e/tests",
			testMatch: /auth-.*\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				storageState: { cookies: [], origins: [] },
			},
		},
		// Primary test project: depends on setup so auth files exist before running
		{
			name: "chromium",
			testDir: "./e2e/tests",
			testIgnore: /auth-.*\.spec\.ts/,
			use: {
				...devices["Desktop Chrome"],
				launchOptions: { args: [] },
			},
			dependencies: ["setup"],
		},
		{
			name: "Mobile Chrome",
			testDir: "./e2e/tests",
			testIgnore: /auth-.*\.spec\.ts/, // Exclude auth tests
			use: {
				...devices["Pixel 5"],
				// storageState: "e2e/.auth/alice.json",
				launchOptions: {
					args: [
						// "--remote-debugging-port=9222",
						// Set X (Horizontal) and Y (Vertical) coordinates
						// Example: X=1950, Y=50 (Pushes the window onto the second monitor)
						// "--window-position=-1950,50",
						// OPTIONAL: Also set a specific window size
						// "--window-size=1280,1024",
					],
				},
			},
			dependencies: ["setup"],
		},

		// PWA offline tests run against the built preview bundle (real service worker).
		// These tests only need the preview server — no auth, no dev server, no worker.
		// Set PLAYWRIGHT_PWA_ONLY=1 in CI to isolate the preview-only server set.
		{
			name: "chromium-pwa-offline",
			testDir: "./e2e/tests-preview",
			use: {
				...devices["Desktop Chrome"],
				baseURL: `http://localhost:${PREVIEW_PORT}`,
			},
			// No auth dependency: pwa-001/002/003 only test SW activation and installability.
			// preview-setup is available for future auth-required preview tests when needed.
		},
	],
	// ── webServer ──────────────────────────────────────────────────────────────
	// PLAYWRIGHT_PWA_ONLY=1 (set by CI's test-pwa-offline job) starts ONLY the
	// preview server so the sharded matrix jobs don't try to run `vite preview`
	// without a built dist/, and so the PWA job doesn't launch an unnecessary
	// dev server + worker.
	//
	// Locally (CI not set): all three servers are always included so normal
	// `npm run test:e2e` works without extra env vars.
	webServer: [
		// ── Dev server + worker (needed by setup/main E2E; not for PWA-only runs) ──
		...(!process.env.PLAYWRIGHT_PWA_ONLY
			? [
					// App dev server — MUST be started with dev:test so MODE === 'test'
					// which is required for __cfTestApi to attach in CubeAuthProvider.
					{
						command: "npm run dev:test",
						url: `http://localhost:${DEV_PORT}`,
						reuseExistingServer: !process.env.CI,
						timeout: 120 * 1000,
						env: {
							VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "",
							VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "",
						},
					},
					// Sync worker (oosync Cloudflare Worker dev server)
					{
						command: "npm run dev",
						cwd: resolve(__dirname, "worker"),
						url: `http://localhost:${WORKER_PORT}/health`,
						reuseExistingServer: !process.env.CI,
						timeout: 120 * 1000,
					},
			  ]
			: []),
		// ── Preview server (needed for PWA offline tests; locally always included) ──
		// In CI: only included when PLAYWRIGHT_PWA_ONLY=1 (test-pwa-offline job).
		// In the sharded matrix jobs PLAYWRIGHT_PWA_ONLY is not set so this entry
		// is omitted — vite preview would fail without a dist/ anyway.
		...(process.env.PLAYWRIGHT_PWA_ONLY || !process.env.CI
			? [
					{
						command: `npx vite preview --strictPort --port ${PREVIEW_PORT}`,
						url: `http://localhost:${PREVIEW_PORT}`,
						reuseExistingServer: !process.env.CI,
						timeout: 30 * 1000,
					},
			  ]
			: []),
	],
});
