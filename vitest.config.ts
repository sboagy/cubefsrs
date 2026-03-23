import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "jsdom",
		include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
		globals: true,
		setupFiles: ["./tests/setup/local-storage.ts"],
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
			"@oosync": fileURLToPath(
				new URL("./node_modules/oosync/src", import.meta.url),
			),
			"@shared-generated": fileURLToPath(
				new URL("./shared/generated", import.meta.url),
			),
			"@sync-schema": fileURLToPath(
				new URL("./shared/sync-schema", import.meta.url),
			),
		},
	},
});
