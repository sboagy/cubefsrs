import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

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
		},
	},
	server: {
		port: 5174,
	},
});
