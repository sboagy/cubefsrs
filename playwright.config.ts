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
	],
	webServer: [
		// App dev server — MUST be started with dev:test so MODE === 'test'
		// which is required for __cfTestApi to attach in CubeAuthProvider.
		// If the server is already running, Playwright will reuse it.
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
	],
});
