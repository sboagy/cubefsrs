import { createSignal } from "solid-js";
import { safeGet, safeSet } from "@/services/persistence/localStorage";

export type OrientationMode = "white-up" | "yellow-up";

const stored = safeGet<OrientationMode>(
	"cubefsrs.orientationMode",
	"yellow-up",
);
const [orientationMode, setOrientationModeSignal] =
	createSignal<OrientationMode>(stored);

export { orientationMode };

export function setOrientationMode(mode: OrientationMode) {
	safeSet("cubefsrs.orientationMode", mode);
	setOrientationModeSignal(mode);
	// Expose to non-reactive service layer used by tracking
	window._orientationMode = mode;
}

// Initialise global on load
if (typeof window !== "undefined") {
	window._orientationMode = stored;
}
