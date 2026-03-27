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
}
