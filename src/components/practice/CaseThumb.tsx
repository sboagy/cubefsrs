import { Alg } from "cubing/alg";
import type { TwistyPlayer, VisualizationFormat } from "cubing/twisty";
import { onCleanup, onMount } from "solid-js";
import { createTwistyPlayerMount } from "@/lib/twisty/createTwistyPlayerMount";

interface Props {
	name: string;
	alg: string;
	category?: string;
}

function pickVisualization(cat?: string): VisualizationFormat {
	const c = (cat || "").toLowerCase();
	if (c.includes("oll") || c.includes("pll")) {
		return "experimental-2D-LL" as VisualizationFormat;
	}
	return "3D" as VisualizationFormat;
}

const validStickering = [
	"EOcross",
	"LSOCLL",
	"EOline",
	"LSOLL",
	"Daisy",
	"Cross",
	"ZBLS",
	"ZBLL",
	"WVLS",
	"OCLL",
	"L6EO",
	"L10P",
	"EPLL",
	"EOLL",
	"CPLL",
	"COLL",
	"CMLL",
	"VLS",
	"PLL",
	"OLL",
	"L6E",
	"F2L",
	"ELS",
	"ELL",
	"CLS",
	"CLL",
	"LS",
	"LL",
	"EO",
];

function pickStickering(category?: string): string {
	if (!category) return "full";
	const stripped = category.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
	for (const item of validStickering) {
		if (stripped === item.toLowerCase()) return item;
	}
	const words = category.toLowerCase().split(/[^a-zA-Z0-9]+/);
	for (const item of validStickering) {
		for (const word of words) {
			if (word === item.toLowerCase()) return item;
		}
	}
	return "full";
}

export default function CaseThumb(props: Props) {
	let host: HTMLDivElement | undefined;
	let player: TwistyPlayer | null = null;

	onMount(() => {
		if (!host) return;
		player = createTwistyPlayerMount({
			puzzle: "3x3x3",
			visualization: pickVisualization(props.category),
			alg: "",
			experimentalSetupAnchor: "start",
			background: "none",
			controlPanel: "none",
			viewerLink: "none",
			hintFacelets: "none",
			experimentalDragInput: "none",
			tempoScale: 5,
			experimentalStickering: pickStickering(props.category),
		});

		const style = (player as unknown as HTMLElement).style;
		style.width = "100%";
		style.height = "100%";
		style.position = "absolute";
		style.inset = "0";
		host.appendChild(player as unknown as HTMLElement);

		try {
			const algStr = props.alg.trim();
			const inverted = algStr
				? Alg.fromString(algStr).invert()
				: Alg.fromString("");
			player.experimentalSetupAlg = inverted;
			player.alg = Alg.fromString("");
		} catch {
			// ignore parse errors
		}
	});

	onCleanup(() => {
		if (player && host) {
			try {
				host.removeChild(player as unknown as HTMLElement);
			} catch {
				// ignore
			}
		}
		player = null;
	});

	return (
		<div class="p-3 text-left">
			<div class="text-sm font-medium truncate" title={props.name}>
				{props.name}
			</div>
			<div ref={host} class="relative mt-2 h-28 overflow-hidden -mx-2 -mb-2" />
		</div>
	);
}
