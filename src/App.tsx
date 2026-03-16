import { type RouteSectionProps, useLocation } from "@solidjs/router";
import { Show } from "solid-js";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Sidebar from "@/components/layout/Sidebar";
import { initTheme } from "@/stores/theme";

export default function App(props: RouteSectionProps) {
	initTheme();
	const location = useLocation();

	// The /login route renders without the sidebar layout.
	// CubeAuthProvider (and Rhizome's AuthProvider) live in main.tsx, wrapping
	// the Router, so auth context is available for both the login page and app.
	const isLoginPage = () => location.pathname === "/login";

	return (
		<Show when={!isLoginPage()} fallback={props.children}>
			<ProtectedRoute>
				<div class="min-h-screen grid grid-cols-1 md:grid-cols-[260px_1fr]">
					<aside class="border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
						<Sidebar />
					</aside>
					<main class="p-4 md:p-6">{props.children}</main>
				</div>
			</ProtectedRoute>
		</Show>
	);
}
