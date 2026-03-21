/**
 * e2e/test-config.ts
 *
 * Shared config constants for CubeFSRS E2E tests.
 */
import { test } from "@playwright/test";

/**
 * Base URL resolved from the active Playwright project at runtime.
 * Falls back to localhost:5174 (CubeFSRS dev port) for imports outside of
 * a test execution context (e.g. during module imports).
 */
export const BASE_URL = {
	toString() {
		try {
			const url = test.info().project.use.baseURL;
			return url || "http://localhost:5174";
		} catch {
			return "http://localhost:5174";
		}
	},
};
