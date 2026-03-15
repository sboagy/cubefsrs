import type { RouteSectionProps } from "@solidjs/router";
import CubeAuthProvider from "@/components/auth/CubeAuthProvider";
import Sidebar from "@/components/layout/Sidebar";
import { initTheme } from "@/stores/theme";

export default function App(props: RouteSectionProps) {
	initTheme();

	return (
		<CubeAuthProvider>
			<div class="min-h-screen grid grid-cols-1 md:grid-cols-[260px_1fr]">
				<aside class="border-b md:border-b-0 md:border-r border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
					<Sidebar />
				</aside>
				<main class="p-4 md:p-6">{props.children}</main>
			</div>
		</CubeAuthProvider>
	);
}
