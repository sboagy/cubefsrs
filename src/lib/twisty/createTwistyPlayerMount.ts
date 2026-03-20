/**
 * createTwistyPlayerMount.ts
 *
 * Single seam for constructing TwistyPlayer elements.  Both CubeViewer and
 * CaseThumb call this instead of `new TwistyPlayer(...)` directly so that
 * Playwright E2E tests (MODE=test) can get a lightweight DOM stub without
 * loading WebGL or WASM, while production builds always use the real player.
 *
 * The return value is typed as `TwistyPlayer` so that callers can continue to
 * set cube-specific properties (alg, experimentalSetupAlg, visualization, etc.)
 * via the same assignment syntax they already use.  In test mode those writes
 * land on expando properties of a plain `<div>` and are safely ignored.
 */

import { TwistyPlayer } from "cubing/twisty";

export type TwistyPlayerConfig = ConstructorParameters<typeof TwistyPlayer>[0];

/**
 * Create a TwistyPlayer (production) or a DOM stub (test mode).
 *
 * The stub is a plain `<div data-testid="twisty-player-stub">` that can be
 * appended to the DOM and accepts arbitrary property assignments without
 * attempting to initialise WebGL or load WASM.
 */
export function createTwistyPlayerMount(
	config: TwistyPlayerConfig,
): TwistyPlayer {
	if (import.meta.env.MODE === "test") {
		// Return a minimal DOM element cast as TwistyPlayer.  CubeViewer and
		// CaseThumb append this to a host div, then set properties like
		// `alg`, `experimentalSetupAlg`, `visualization`, `hintFacelets`, and
		// camera-related keys via `as unknown as Record<string, unknown>` casts.
		// All of those writes become expando properties on the div and are silently
		// ignored — no WebGL context, no WASM download.
		const stub = document.createElement("div");
		stub.setAttribute("data-testid", "twisty-player-stub");
		return stub as unknown as TwistyPlayer;
	}

	return new TwistyPlayer(config);
}
