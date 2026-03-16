import { createSignal } from "solid-js";
import DeviceInfoGrid from "@/components/device/DeviceInfoGrid";
import { type FsrsUserParams, getFsrsConfig } from "@/services/scheduler/fsrs";
import {
	connectDevice,
	device,
	disconnectDevice,
	setAutoReconnect,
} from "@/stores/device";
import { applyParams, clearReviews } from "@/stores/fsrs";
import { orientationMode, setOrientationMode } from "@/stores/orientation";
import type { ThemeMode } from "@/stores/settings";
import {
	setAllowDrag,
	setBackview,
	setControlPanel,
	setFlashingIndicator,
	setGyroAnimation,
	setMirrorStickers,
	setShowCaseName,
	setTheme,
	settings,
	setVisualization,
} from "@/stores/settings";

export default function OptionsView() {
	const [params, setParams] = createSignal<FsrsUserParams>({
		...getFsrsConfig(),
	});

	function applyFsrs() {
		applyParams(params());
	}

	function doClears() {
		clearReviews();
	}

	async function toggleConnect() {
		if (device.connected) await disconnectDevice();
		else await connectDevice();
	}

	async function resetGyro() {
		try {
			await disconnectDevice();
		} finally {
			// no-op; user reconnects manually
		}
	}

	return (
		<div class="space-y-4">
			<h1 class="text-2xl font-semibold">Options</h1>
			<p class="text-sm opacity-80">Configure UI, device, FSRS, and more.</p>

			<section class="space-y-2">
				<h2 class="text-lg font-medium">Orientation</h2>
				<p class="text-sm opacity-80">
					Choose which color is on top for the viewer and future move mapping.
				</p>
				<div class="flex gap-2">
					<button
						type="button"
						class={`px-3 py-2 rounded border ${orientationMode() === "yellow-up" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"}`}
						onClick={() => setOrientationMode("yellow-up")}
					>
						Yellow Up
					</button>
					<button
						type="button"
						class={`px-3 py-2 rounded border ${orientationMode() === "white-up" ? "bg-blue-600 text-white border-blue-600" : "border-gray-300"}`}
						onClick={() => setOrientationMode("white-up")}
					>
						White Up
					</button>
				</div>
				<div class="text-sm text-gray-500">
					Current: <span class="font-medium">{orientationMode()}</span>
				</div>
			</section>

			<section class="space-y-2">
				<h2 class="text-lg font-medium">UI &amp; Visualization</h2>
				<div class="grid md:grid-cols-2 gap-2 max-w-2xl">
					<div class="flex flex-col gap-1">
						<span class="text-sm font-medium">Theme</span>
						<div class="flex rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden w-fit">
							{(["light", "system", "dark"] as ThemeMode[]).map((mode) => (
								<button
									type="button"
									class={`px-3 py-1.5 text-sm capitalize transition-colors ${
										settings.theme === mode
											? "bg-blue-600 text-white"
											: "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
									}`}
									onClick={() => setTheme(mode)}
								>
									{mode}
								</button>
							))}
						</div>
					</div>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.gyroAnimation}
							onChange={(e) =>
								setGyroAnimation((e.target as HTMLInputElement).checked)
							}
						/>
						Animate with Gyroscope
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.controlPanel}
							onChange={(e) =>
								setControlPanel((e.target as HTMLInputElement).checked)
							}
						/>
						Show Control Panel
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.allowDrag}
							onChange={(e) =>
								setAllowDrag((e.target as HTMLInputElement).checked)
							}
						/>
						Allow Cube Dragging
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.mirrorStickers}
							onChange={(e) =>
								setMirrorStickers((e.target as HTMLInputElement).checked)
							}
						/>
						Floating Mirror Stickers
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.flashingIndicator}
							onChange={(e) =>
								setFlashingIndicator((e.target as HTMLInputElement).checked)
							}
						/>
						Flashing Indicator
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.showCaseName}
							onChange={(e) =>
								setShowCaseName((e.target as HTMLInputElement).checked)
							}
						/>
						Show Case Name
					</label>
					<label class="flex items-center gap-2">
						<input
							type="checkbox"
							checked={settings.backview}
							onChange={(e) =>
								setBackview((e.target as HTMLInputElement).checked)
							}
						/>
						Back View
					</label>
					<label class="flex items-center gap-2">
						<span>Visualization</span>
						<select
							class="input"
							value={settings.visualization}
							onChange={(e) =>
								setVisualization(
									(e.target as HTMLSelectElement).value as "PG3D" | "3D" | "2D",
								)
							}
						>
							<option value="PG3D">PG3D</option>
							<option value="3D">3D</option>
							<option value="2D">2D</option>
						</select>
					</label>
				</div>
			</section>

			<section class="space-y-2">
				<h2 class="text-lg font-medium">FSRS</h2>
				<div class="grid grid-cols-2 gap-2 max-w-md">
					<label class="flex items-center justify-between gap-3">
						<span>Retention</span>
						<input
							type="number"
							step="0.01"
							min="0.01"
							max="1"
							class="input w-28"
							value={params().request_retention}
							onInput={(e) =>
								setParams((p) => ({
									...p,
									request_retention: parseFloat(
										(e.target as HTMLInputElement).value,
									),
								}))
							}
						/>
					</label>
					<label class="flex items-center justify-between gap-3">
						<span>Max interval (days)</span>
						<input
							type="number"
							step="1"
							min="1"
							class="input w-28"
							value={params().maximum_interval}
							onInput={(e) =>
								setParams((p) => ({
									...p,
									maximum_interval: parseInt(
										(e.target as HTMLInputElement).value,
										10,
									),
								}))
							}
						/>
					</label>
					<label class="flex items-center justify-between gap-3">
						<span>Fuzz</span>
						<input
							type="checkbox"
							checked={params().enable_fuzz}
							onChange={(e) =>
								setParams((p) => ({
									...p,
									enable_fuzz: (e.target as HTMLInputElement).checked,
								}))
							}
						/>
					</label>
					<label class="flex items-center justify-between gap-3">
						<span>Short-term</span>
						<input
							type="checkbox"
							checked={params().enable_short_term}
							onChange={(e) =>
								setParams((p) => ({
									...p,
									enable_short_term: (e.target as HTMLInputElement).checked,
								}))
							}
						/>
					</label>
				</div>
				<div class="flex gap-2">
					<button
						type="button"
						class="px-3 py-2 rounded bg-blue-600 text-white"
						onClick={applyFsrs}
					>
						Apply
					</button>
					<button type="button" class="px-3 py-2 rounded border" onClick={doClears}>
						Clear Reviews
					</button>
				</div>
			</section>

			<section class="space-y-2">
				<h2 class="text-lg font-medium">Device</h2>
				<div class="flex gap-2">
					<button
						type="button"
						class="px-3 py-2 rounded bg-blue-600 text-white disabled:opacity-60"
						disabled={device.connecting}
						onClick={toggleConnect}
					>
						{device.connected
							? "Disconnect"
							: device.connecting
								? "Connecting…"
								: "Connect"}
					</button>
					<button type="button" class="px-3 py-2 rounded border" onClick={resetGyro}>
						Reset Gyro
					</button>
				</div>
				<div class="mt-2 text-sm flex items-center gap-2">
					<input
						id="auto-reconnect"
						type="checkbox"
						checked={device.autoReconnect}
						onChange={(e) =>
							setAutoReconnect((e.target as HTMLInputElement).checked)
						}
					/>
					<label for="auto-reconnect">Auto Reconnect</label>
				</div>
				<DeviceInfoGrid class="mt-2" />
			</section>
		</div>
	);
}
