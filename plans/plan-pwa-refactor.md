# Plan: PWA Refactor for CubeFSRS

**Issue:** [#1 — PWA Refactor](https://github.com/sboagy/cubefsrs/issues/1)  
**Reference PR:** [tunetrees#474](https://github.com/sboagy/tunetrees/pull/474)  
**Status:** Ready for implementation — all decisions recorded in §3

---

## 0. Purpose of This Document

This plan maps issue #1 to the concrete file changes needed in the CubeFSRS repo.
The model is TuneTrees, which already has a fully working PWA implementation.
CubeFSRS will mirror that setup closely, adapted for its domain and icons.

---

## 1. Current State

| Aspect | Current CubeFSRS state |
|---|---|
| Vite version | `8.0.3` (correct; must not be downgraded) |
| `vite-plugin-pwa` | ❌ Not installed |
| `.npmrc` | ❌ Does not exist |
| CI `NPM_CONFIG_LEGACY_PEER_DEPS` | ❌ Not set in `ci.yml` or `lighthouse.yml` |
| PWA icons (192×192, 512×512) | ❌ Not present; only `public/favicon.svg` |
| `VitePWA` plugin in `vite.config.ts` | ❌ Not present |
| `index.html` PWA meta tags | ❌ Missing (`theme-color`, `apple-touch-icon`, manifest) |
| `public/clear-sw.html` | ❌ Not present |
| Offline E2E tests | ⚠️ `offline-001-device-mode.spec.ts` exists but tests app logic, not SW/PWA install |
| Playwright `chromium-pwa-offline` project | ❌ Not configured |
| `e2e/tests-preview/` directory | ❌ Does not exist |

---

## 2. Implementation Scope

### 2a. Dependency + npm config (Step 1 — smallest delta)

**Files:**
- Create `.npmrc` — the same workaround used in TuneTrees:
  ```
  # vite-plugin-pwa@1.2.0 still advertises a Vite <=7 peer range.
  # CubeFSRS installs and builds on Vite 8, so keep npm from failing on stale peer metadata.
  legacy-peer-deps=true
  ```
- `package.json` — add to `devDependencies`:
  ```json
  "vite-plugin-pwa": "^1.2.0"
  ```

### 2b. CI workflow updates (Step 2)

**Files:**
- `.github/workflows/ci.yml` — add to the top-level `env:` block:
  ```yaml
  NPM_CONFIG_LEGACY_PEER_DEPS: "true"
  ```
- `.github/workflows/lighthouse.yml` — same addition

### 2c. App icons (Step 3)

**Files to create in `public/`:**
- `public/icon-192x192.png` — 192×192 PWA icon
- `public/icon-512x512.png` — 512×512 PWA icon

**Icon source:** Rasterize the existing `public/favicon.svg` to the required PNG sizes.
During implementation a small Node script using `sharp` (added as a `devDependency`) will
convert `favicon.svg → icon-192x192.png` and `favicon.svg → icon-512x512.png`,
then the script can be discarded (or kept as `scripts/generate-icons.ts`). The PNGs
are committed to the repo so the build and CI do not need `sharp` at runtime.

### 2d. `vite.config.ts` — Add VitePWA plugin (Step 4)

Import and register `VitePWA` following the TuneTrees pattern.

Key config choices that mirror TuneTrees, with CubeFSRS-specific values:

```ts
VitePWA({
  registerType: "prompt",          // consistent with TuneTrees
  includeAssets: ["favicon.svg", "icon-192x192.png", "icon-512x512.png"],
  manifest: {
    name: "CubeFSRS - Algorithm Trainer",
    short_name: "CubeFSRS",
    description: "Spaced repetition training for Rubik's Cube algorithms.",
    theme_color: "#1e3a5f",                  // confirmed: dark navy, consistent with existing palette
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
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
    // Cache all static assets including WASM (cubing + sql.js) and SQL migration files
    globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,wasm,sql}"],
    runtimeCaching: [
      {
        // Supabase API: network-first so fresh data is preferred when online
        urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
        handler: "NetworkFirst",
        options: {
          cacheName: "supabase-api-cache",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 60 * 60 * 24, // 24 hours
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
            maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
          },
        },
      },
    ],
    cleanupOutdatedCaches: true,
    navigateFallback: "index.html",
    navigateFallbackDenylist: [/^\/api/, /^\/assets/],
    clientsClaim: true,
    skipWaiting: true,
  },
  injectRegister: "inline",   // No explicit registerSW import in main.tsx needed
  devOptions: {
    enabled: false,  // Disable PWA in dev to avoid caching problems
    type: "module",
  },
}),
```

Also mirroring TuneTrees: add `VITE_WORKBOX_DEBUG` support and the `__WB_DISABLE_DEV_LOGS` define constant.

**Note:** CubeFSRS is on Tailwind CSS v3 (PostCSS-based), not v4/`@tailwindcss/vite`, so no tailwindcss Vite plugin will be added.

### 2e. `index.html` — Add PWA meta tags (Step 5)

Add inside `<head>` (matching TuneTrees pattern):
```html
<!-- PWA Meta Tags -->
<meta name="theme-color" content="#1e3a5f" />
<meta name="description" content="Spaced repetition training for Rubik's Cube algorithms." />
<!-- vite-plugin-pwa automatically injects the manifest link in the built output.
     Do NOT add it manually here or dev mode errors will result. -->
<link rel="apple-touch-icon" href="/icon-192x192.png" />
```

### 2f. `public/clear-sw.html` (Step 6)

Create a utility page (identical to TuneTrees pattern) to help users/developers
clear a stale service worker registration:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Clear Service Worker</title>
</head>
<body>
    <h1>Clearing Service Worker...</h1>
    <p id="status">Working...</p>
    <script>
        navigator.serviceWorker.getRegistrations().then(registrations => {
            for(let registration of registrations) {
                registration.unregister();
            }
            document.getElementById('status').innerHTML =
              '✅ Service worker cleared! <a href="/">Go to app</a>';
        });
    </script>
</body>
</html>
```

### 2g. Playwright config — offline/PWA project (Step 7)

Add to `playwright.config.ts`:

1. Define `PREVIEW_PORT = 4174` (already the port used by `preview:local` script)
2. Add a `preview-setup` project:
   ```ts
   {
     name: "preview-setup",
     testDir: "./e2e/setup",
     testMatch: /.*\.setup\.ts$/,
     use: { baseURL: `http://localhost:${PREVIEW_PORT}` },
   }
   ```
3. Add a `chromium-pwa-offline` project:
   ```ts
   {
     name: "chromium-pwa-offline",
     testDir: "./e2e/tests-preview",
     use: {
       ...devices["Desktop Chrome"],
       baseURL: `http://localhost:${PREVIEW_PORT}`,
     },
     dependencies: ["preview-setup"],
   }
   ```
4. Add a preview `webServer` entry:
   ```ts
   {
     command: "npm run build:preview-local && npm run preview:local",
     url: `http://localhost:${PREVIEW_PORT}`,
     reuseExistingServer: !process.env.CI,
     timeout: 180 * 1000,
     env: {
       VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ?? "",
       VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY ?? "",
     },
   }
   ```

   > The preview webServer is included in the standard CI matrix (same as TuneTrees).
   > A dedicated `test-pwa-offline` job is added to `ci.yml` — see §2i.

### 2h. Offline / PWA E2E tests (Step 8)

Create `e2e/tests-preview/` with PWA-specific tests.

These tests run against the **preview build** (not dev server) so the actual service worker
is active. The existing `offline-001-device-mode.spec.ts` tests app logic without a real
SW; the new tests in `tests-preview/` test the actual PWA install and offline cache.

**Proposed initial tests:**

| File | Priority | What it tests |
|---|---|---|
| `pwa-001-service-worker.spec.ts` | P0 | SW registers successfully, `waiting` state resolves |
| `pwa-002-offline-practice.spec.ts` | P0 | Practice view renders after going offline (using real SW cache) |
| `pwa-003-installability.spec.ts` | P1 | Manifest present, icons accessible, theme color set correctly |

> Scope: **Standard (B)** — pwa-001 through pwa-003.

---

## 3. Decisions

| # | Question | Decision |
|---|---|---|
| Q1 | App icons | **C** — Rasterize existing `favicon.svg` to 192×192 and 512×512 PNG using `sharp` |
| Q2 | SW update strategy | **A** — `"prompt"`, consistent with TuneTrees |
| Q3 | Manifest name | Confirmed: `"CubeFSRS - Algorithm Trainer"` / `"CubeFSRS"` |
| Q4 | Theme color | **C** — `#1e3a5f` (dark navy, consistent with existing app palette) |
| Q5 | CI coverage | **A** — Include in standard CI; add a dedicated `test-pwa-offline` job in `ci.yml` (same pattern as TuneTrees, optimization deferred to a future cross-app effort) |
| Q6 | E2E scope | **B** — Standard: pwa-001 (SW active), pwa-002 (offline practice), pwa-003 (manifest/installability) |

---

## 4. Additional CI Job (Step 9)

Add a new `test-pwa-offline` job to `.github/workflows/ci.yml`.

This job:
- Is separate from the sharded `test` (Playwright) job — it runs a non-sharded, single-worker pass targeting only the `chromium-pwa-offline` project.
- Builds the app with `build:preview-local` first, then starts the preview server and runs Playwright.
- Needs: `[test-unit]` (same as the main playwright job).

Sketch:
```yaml
  test-pwa-offline:
    name: PWA Offline Tests
    runs-on: ubuntu-latest
    needs: [test-unit]
    environment: cubefsrs_ci_env
    env:
      OP_SERVICE_ACCOUNT_TOKEN: ${{ secrets.OP_SERVICE_ACCOUNT_TOKEN }}
      NPM_CONFIG_LEGACY_PEER_DEPS: "true"
    steps:
      - uses: actions/checkout@v5
        # ... same oosync/rhizome checkouts as the main test job ...
      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: "24"
          cache: "npm"
          cache-dependency-path: cubefsrs/package-lock.json
      - name: Install dependencies
        working-directory: cubefsrs
        run: npm ci
      - name: Build preview bundle
        working-directory: cubefsrs
        run: npm run build:preview-local
      - name: Install Playwright browsers
        working-directory: cubefsrs
        run: npx playwright install --with-deps chromium
      - name: Run PWA offline tests
        working-directory: cubefsrs
        run: npx playwright test --project=chromium-pwa-offline
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: pwa-offline-results
          path: cubefsrs/test-results/
```

> **Note:** Supabase is also needed for the preview build (env vars). The full step list
> mirrors the main `test` job's setup (1Password, Supabase start, env population) before
> the build step. The sketch above is abbreviated for readability.

---

## 5. Implementation Order

*(previously §4)*

1. `.npmrc` + `package.json` (`vite-plugin-pwa`) → `npm install`
2. CI workflow `env` updates (`ci.yml`, `lighthouse.yml`) + new `test-pwa-offline` CI job
3. Generate icons from `favicon.svg` using `sharp` → commit `public/icon-192x192.png` and `public/icon-512x512.png`
4. `vite.config.ts` — add VitePWA plugin
5. `index.html` — add PWA meta tags
6. `public/clear-sw.html`
7. Validate: `npm run build:preview-local` + `npm run typecheck` + `npm run lint`
8. `playwright.config.ts` — add `preview-setup` and `chromium-pwa-offline` projects + preview webServer
9. `e2e/tests-preview/` — pwa-001, pwa-002, pwa-003 tests
10. Validate: `npm run test:unit`; manual local PWA smoke (serve preview, open in browser, verify install prompt and offline behavior)

---

## 6. Out of Scope for This Issue

- Changing the Vite version (remains `8.0.3`)
- Tailwind version upgrade (remains v3)
- Adding a SW update toast UI component (deferred; `registerType: "prompt"` logs to console by default until a UI prompt is wired)
- Full offline sync regression suite (TuneTrees-scale; separate issue)
- Optimizing the `test-pwa-offline` CI job cost (deferred; will be addressed cross-app with TuneTrees)
