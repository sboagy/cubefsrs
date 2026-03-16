import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	plugins: [
		solid(),
		// Serve SQL migration files as static assets in both dev and prod build
		viteStaticCopy({
			targets: [
				{
					src: "drizzle/migrations/sqlite/*.sql",
					dest: "drizzle/migrations/sqlite",
				},
			],
		}),
	],
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
			"@oosync": path.resolve(__dirname, "./node_modules/oosync/src"),
			"@shared-generated": path.resolve(__dirname, "./shared/generated"),
			"@sync-schema": path.resolve(__dirname, "./shared/sync-schema"),
		},
	},
	server: {
		port: 5174,
	},
});
