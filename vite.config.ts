import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import solid from "vite-plugin-solid";
import { viteStaticCopy } from "vite-plugin-static-copy";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(() => {
	// Control Workbox debug logging via env var (set VITE_WORKBOX_DEBUG=true to enable)
	const showWorkboxLogs = process.env.VITE_WORKBOX_DEBUG === "true";

	return {
		plugins: [
			tailwindcss(),
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
			VitePWA({
				registerType: "prompt",
				includeAssets: ["favicon.svg", "icon-192x192.png", "icon-512x512.png"],
				manifest: {
					name: "CubeFSRS - Algorithm Trainer",
					short_name: "CubeFSRS",
					description:
						"Spaced repetition training for Rubik's Cube algorithms.",
					theme_color: "#1e3a5f",
					background_color: "#ffffff",
					display: "standalone",
					scope: "/",
					start_url: "/",
					icons: [
						{
							src: "/icon-192x192.png",
							sizes: "192x192",
							type: "image/png",
							purpose: "any maskable",
						},
						{
							src: "/icon-512x512.png",
							sizes: "512x512",
							type: "image/png",
							purpose: "any maskable",
						},
					],
				},
				workbox: {
					// WASM files (cubing, sql.js) can be large; raise the limit
					maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
					// Precache all static assets including WASM and SQLite migration files
					globPatterns: [
						"**/*.{js,css,html,ico,png,svg,woff,woff2,wasm,sql}",
					],
					runtimeCaching: [
						{
							// Supabase API: network-first so fresh data is preferred when online
							urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
							handler: "NetworkFirst",
							options: {
								cacheName: "supabase-api-cache",
								expiration: {
									maxEntries: 100,
									// 24 hours
									maxAgeSeconds: 60 * 60 * 24,
								},
								networkTimeoutSeconds: 10,
							},
						},
						{
							urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
							handler: "CacheFirst",
							options: {
								cacheName: "images-cache",
								expiration: {
									maxEntries: 100,
									// 30 days
									maxAgeSeconds: 60 * 60 * 24 * 30,
								},
							},
						},
					],
					// Remove caches from old SW versions on activation
					cleanupOutdatedCaches: true,
					// Ensure SPA navigations work offline
					navigateFallback: "index.html",
					navigateFallbackDenylist: [/^\/api/, /^\/assets/],
					// Take control of existing clients immediately on SW activation
					clientsClaim: true,
					skipWaiting: true,
				},
				// Inject the SW registration script inline (no separate registerSW.js needed)
				injectRegister: "inline",
				devOptions: {
					// Disable PWA in dev to avoid stale-cache issues during development
					enabled: false,
					type: "module",
				},
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
		// Suppress Workbox dev logs in production builds (set VITE_WORKBOX_DEBUG=true to re-enable)
		define: {
			__WB_DISABLE_DEV_LOGS: !showWorkboxLogs,
		},
	};
});
