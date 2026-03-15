import { Alg } from "cubing/alg";
import { TwistyPlayer } from "cubing/twisty";
import { createEffect, onCleanup, onMount, untrack } from "solid-js";
import { mapTokenByZ2 } from "@/lib/orientationMap";
import { device } from "@/stores/device";
import { orientationMode } from "@/stores/orientation";
import { settings } from "@/stores/settings";

interface Props {
	alg?: string;
	trainNonce?: number;
}

function normalizeMoveToken(m: string): string {
	return m
		.trim()
		.replace(/['\u2032]/g, "'")
		.replace(/[\u200C\u200D]/g, "");
}

export default function CubeViewer(props: Props) {
	let container: HTMLDivElement | undefined;
	let player: TwistyPlayer | null = null;
	let baseSetupStr = ""; // orientation baseline (e.g. "z2" for yellow-up)
	let snapshotSetupStr = ""; // inverse of current alg — shows start state

	// --- Setup helpers ---

	function applySetup() {
		if (!player) return;
		const combined = [baseSetupStr, snapshotSetupStr]
			.filter(Boolean)
			.join(" ")
			.trim();
		try {
			player.experimentalSetupAlg = Alg.fromString(combined);
			player.alg = Alg.fromString("");
		} catch {
			// ignore malformed
		}
	}

	function applyOrientation() {
		if (!player) return;
		baseSetupStr = orientationMode() === "yellow-up" ? "z2" : "";
		applySetup();
	}

	// Show the START state of the algorithm by using its inverse as the setup scramble.
	function applyAlgStr(algStr: string) {
		if (!player) return;
		snapshotSetupStr = "";
		if (algStr.trim().length) {
			try {
				snapshotSetupStr = Alg.fromString(algStr).invert().toString();
			} catch {
				// ignore malformed alg
			}
		}
		applySetup();
	}

	// --- Camera / visualization ---

	function applyCameraView() {
		if (!player) return;
		try {
			if (!device.connected) {
				// No hardware cube: use 3D viewer with top-down angle
				player.visualization = "3D" as never;
				(player as unknown as Record<string, unknown>).cameraLatitudeLimit =
					-90;
				(player as unknown as Record<string, unknown>).cameraLatitude = -45;
				(player as unknown as Record<string, unknown>).cameraLongitude = 0;
			} else {
				// Connected: use the configured visualization with standard angle
				player.visualization = settings.visualization as never;
				(player as unknown as Record<string, unknown>).cameraLatitude = 30;
				(player as unknown as Record<string, unknown>).cameraLongitude = 30;
			}
			player.hintFacelets = settings.mirrorStickers ? "floating" : "none";
		} catch {
			// ignore
		}
	}

	// TwistyPlayer initialises its WebGL context asynchronously after connectedCallback.
	// We must re-push the visualization target at several async boundaries to guarantee it sticks.
	function scheduleCameraApply() {
		applyCameraView();
		try {
			queueMicrotask(() => applyCameraView());
		} catch {}
		try {
			requestAnimationFrame(() => applyCameraView());
		} catch {}
		setTimeout(() => applyCameraView(), 0);
		setTimeout(() => applyCameraView(), 60);
		setTimeout(() => applyCameraView(), 180);
		setTimeout(() => applyCameraView(), 400);
		setTimeout(() => applyCameraView(), 1000);
	}

	// --- Lifecycle ---

	onMount(() => {
		if (!container) return;
		player = new TwistyPlayer({
			puzzle: "3x3x3",
			visualization: "PG3D",
			alg: "",
			experimentalSetupAnchor: "start",
			background: "none",
			controlPanel: settings.controlPanel ? "auto" : "none",
			viewerLink: "none",
			hintFacelets: settings.mirrorStickers ? "floating" : "none",
			experimentalDragInput: settings.allowDrag ? "auto" : "none",
			tempoScale: 5,
			cameraLatitude: 0,
			cameraLongitude: 0,
			experimentalStickering: "full",
		});

		try {
			const s = (player as unknown as HTMLElement).style;
			s.width = "100%";
			s.height = "100%";
			s.position = "absolute";
			s.setProperty("inset", "0");
		} catch {}

		container.appendChild(player as unknown as HTMLElement);

		applyOrientation();
		scheduleCameraApply();
		if (props.alg) applyAlgStr(props.alg);
	});

	onCleanup(() => {
		if (player && container) {
			try {
				container.removeChild(player as unknown as HTMLElement);
			} catch {}
		}
		player = null;
	});

	// --- Reactive effects (all writes to player are untracked to avoid loops) ---

	// Orientation changes
	createEffect(() => {
		void orientationMode(); // track the signal
		untrack(() => applyOrientation());
	});

	// Alg prop or trainNonce changes — reapply start state
	createEffect(() => {
		const alg = props.alg ?? "";
		void props.trainNonce; // also track nonce so Train resets the scramble
		untrack(() => applyAlgStr(alg));
	});

	// Connection state changes — re-apply camera view
	createEffect(() => {
		void device.connected;
		untrack(() => scheduleCameraApply());
	});

	// Apply physical cube moves visually to TwistyPlayer
	createEffect(() => {
		void device.lastMoveAt; // track timestamp
		const mv = device.lastMove;
		if (!mv || !player) return;
		untrack(() => {
			try {
				const norm = normalizeMoveToken(mv);
				const mapped =
					orientationMode() === "yellow-up" ? mapTokenByZ2(norm) : norm;
				(player as TwistyPlayer).experimentalAddMove(mapped, { cancel: false });
			} catch {
				// ignore malformed moves
			}
		});
	});

	return (
		<div
			ref={container}
			class="w-full aspect-square min-h-[240px] bg-transparent relative"
		/>
	);
}
