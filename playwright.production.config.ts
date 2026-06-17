/// <reference types="node" />

import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PRODUCTION_BASE_URL ?? "https://cubefsrs.com";

export default defineConfig({
	testDir: "./e2e/production",
	testMatch: "**/*.spec.ts",
	fullyParallel: false,
	forbidOnly: true,
	retries: process.env.CI ? 2 : 0,
	workers: 1,
	reporter: process.env.CI ? [["blob"], ["list"]] : [["list"]],
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		trace: "retain-on-failure",
		video: "retain-on-failure",
		screenshot: "only-on-failure",
	},
});
