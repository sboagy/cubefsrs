/**
 * __mocks__/cubing/twisty.ts
 *
 * Vitest manual mock for `cubing/twisty`.
 *
 * Provides a minimal `TwistyPlayer` class stub that accepts configuration in
 * its constructor and exposes the properties set by CubeViewer and CaseThumb.
 * The stub never attempts to load WebGL or WASM, so it is safe in jsdom.
 */

export type VisualizationFormat = string;

export class TwistyPlayer {
	alg: unknown = "";
	experimentalSetupAlg: unknown = "";
	experimentalSetupAnchor: string;
	visualization: VisualizationFormat;
	background: string;
	controlPanel: string;
	viewerLink: string;
	hintFacelets: string;
	experimentalDragInput: string;
	tempoScale: number;
	experimentalStickering: string;
	puzzle: string;
	cameraLatitude: number;
	cameraLongitude: number;
	cameraLatitudeLimit: number;

	/** Mimic the real TwistyPlayer's HTMLElement interface for appendChild calls. */
	readonly style: CSSStyleDeclaration;
	readonly dataset: DOMStringMap;

	constructor(config: Record<string, unknown> = {}) {
		this.experimentalSetupAnchor =
			(config.experimentalSetupAnchor as string) ?? "start";
		this.visualization = (config.visualization as string) ?? "3D";
		this.background = (config.background as string) ?? "none";
		this.controlPanel = (config.controlPanel as string) ?? "none";
		this.viewerLink = (config.viewerLink as string) ?? "none";
		this.hintFacelets = (config.hintFacelets as string) ?? "none";
		this.experimentalDragInput =
			(config.experimentalDragInput as string) ?? "none";
		this.tempoScale = (config.tempoScale as number) ?? 1;
		this.experimentalStickering =
			(config.experimentalStickering as string) ?? "full";
		this.puzzle = (config.puzzle as string) ?? "3x3x3";
		this.cameraLatitude = (config.cameraLatitude as number) ?? 0;
		this.cameraLongitude = (config.cameraLongitude as number) ?? 0;
		this.cameraLatitudeLimit = 90;
		// Stub DOM surface (CubeViewer/CaseThumb access player.style and
		// host.appendChild(player as unknown as HTMLElement)).
		const el = document.createElement("div");
		this.style = el.style;
		this.dataset = el.dataset;
	}
}
