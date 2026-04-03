import { Route, Router } from "@solidjs/router";
import { lazy } from "solid-js";
import { render } from "solid-js/web";
import CubeAuthProvider from "@/components/auth/CubeAuthProvider";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import LoginView from "@/views/LoginView";
import App from "./App";
import "./styles/tailwind.css";
import { DatabaseBrowser } from "@rhizome/core";
import { initFsrs } from "@/stores/fsrs";

const PracticeView = lazy(() => import("@/views/PracticeView"));
const NewAlgView = lazy(() => import("@/views/NewAlgView"));
const OptionsView = lazy(() => import("@/views/OptionsView"));
const HelpView = lazy(() => import("@/views/HelpView"));
const AlgLibraryView = lazy(() => import("@/views/AlgLibraryView"));
const BuildView = lazy(() => import("@/views/BuildView"));

initFsrs();

// Expose the Vite build mode as a synchronous window property so E2E setup
// scripts can detect server mode immediately — before any auth or DB work.
// This avoids a silent 30s hang in auth.setup.ts when the dev server was
// accidentally started without `--mode test` (i.e. `npm run dev` vs `dev:test`).
if (import.meta.env.MODE === "test") {
	(window as unknown as Record<string, string>).__cfMode = "test";
}

const root = document.getElementById("app");
if (!root) throw new Error("#app element not found");
render(
	() => (
		// CubeAuthProvider wraps the Router so auth context (useAuth) is available
		// both on the /login page and inside the app layout (ProtectedRoute, Sidebar).
		<CubeAuthProvider>
			<Router root={App}>
				<Route path="/login" component={LoginView} />
				<Route path="/" component={PracticeView} />
				<Route path="/new" component={NewAlgView} />
				<Route path="/options" component={OptionsView} />
				<Route path="/help" component={HelpView} />
				<Route path="/library" component={AlgLibraryView} />
				<Route path="/build" component={BuildView} />
				<Route
					path="/debug/db"
					component={() => (
						<ProtectedRoute>
							<DatabaseBrowser />
						</ProtectedRoute>
					)}
				/>
			</Router>
		</CubeAuthProvider>
	),
	root,
);
