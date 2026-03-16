import { createEffect, onCleanup } from "solid-js";
import { settings } from "@/stores/settings";

export function initTheme() {
	const mq = window.matchMedia("(prefers-color-scheme: dark)");

	// Reactively apply the `dark` class based on the stored theme preference.
	// When theme is "system", mirror the OS media query.
	createEffect(() => {
		const isDark =
			settings.theme === "dark" ||
			(settings.theme === "system" && mq.matches);
		document.documentElement.classList.toggle("dark", isDark);
	});

	// Re-evaluate when the OS preference changes (only matters for "system" mode).
	const onSystemChange = () => {
		// Triggering the effect is enough — it reads mq.matches reactively.
		// Force a re-run by touching the DOM class directly.
		const isDark =
			settings.theme === "dark" ||
			(settings.theme === "system" && mq.matches);
		document.documentElement.classList.toggle("dark", isDark);
	};
	mq.addEventListener("change", onSystemChange);
	onCleanup(() => mq.removeEventListener("change", onSystemChange));
}
