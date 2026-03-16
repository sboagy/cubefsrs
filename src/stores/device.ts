import { batch } from "solid-js";
import { createStore } from "solid-js/store";
import {
	connectGanCube,
	disconnectGanCube,
	type GanEvent,
	onGanEvents,
} from "@/services/ganBluetooth";
import { safeGet, safeSet } from "@/services/persistence/localStorage";
import type { DeviceState } from "@/types/device";

const [device, setDevice] = createStore<DeviceState>({
	connected: false,
	connecting: false,
	info: {},
	quaternion: undefined,
	angularVelocity: undefined,
	lastMove: undefined,
	lastMoveAt: undefined,
	facelets: undefined,
	autoReconnect: safeGet("cubedex.device.autoReconnect", true),
});

// Keep exactly one GAN subscription alive so reconnects do not duplicate move events.
let stopGanEvents: (() => void) | null = null;

export { device };

export async function connectDevice() {
	if (device.connected || device.connecting) return;
	setDevice("connecting", true);
	try {
		await connectGanCube();
		setDevice("connected", true);
		stopGanEvents?.();
		stopGanEvents = onGanEvents((ev: GanEvent) => {
			if (ev.type === "info") setDevice("info", { ...device.info, ...ev.info });
			else if (ev.type === "battery")
				setDevice("info", { ...device.info, battery: ev.battery });
			else if (ev.type === "move") {
				const moveTimestamp = Date.now();
				// Emit the token and timestamp as one reactive edge so downstream effects only run once per turn.
				batch(() => {
					setDevice("lastMove", ev.move);
					setDevice("lastMoveAt", moveTimestamp);
				});
			} else if (ev.type === "facelets") setDevice("facelets", ev.facelets);
			else if (ev.type === "quaternion")
				setDevice("quaternion", ev.quaternion as DeviceState["quaternion"]);
			else if (ev.type === "angular")
				setDevice("angularVelocity", ev.w as DeviceState["angularVelocity"]);
			else if (ev.type === "disconnect") {
				stopGanEvents?.();
				stopGanEvents = null;
				batch(() => {
					setDevice("connected", false);
					setDevice("connecting", false);
				});
				if (device.autoReconnect) {
					setTimeout(() => connectDevice().catch(() => {}), 1000);
				}
			}
		});
	} catch (e) {
		console.error("Connect failed", e);
		setDevice("connected", false);
	} finally {
		setDevice("connecting", false);
	}
}

export async function disconnectDevice() {
	await disconnectGanCube();
	stopGanEvents?.();
	stopGanEvents = null;
	batch(() => {
		setDevice("connected", false);
		setDevice("info", {});
		setDevice("quaternion", undefined);
		setDevice("angularVelocity", undefined);
		setDevice("lastMove", undefined);
		setDevice("lastMoveAt", undefined);
		setDevice("facelets", undefined);
	});
}

export function setAutoReconnect(v: boolean) {
	setDevice("autoReconnect", v);
	safeSet("cubedex.device.autoReconnect", v);
}
