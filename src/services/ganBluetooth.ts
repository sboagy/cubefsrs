import {
	type GanCubeConnection,
	type GanCubeEvent,
	connectGanCube as libConnectGanCube,
} from "gan-web-bluetooth";
import type { Quaternion } from "@/types/device";

export type GanEvent =
	| {
			type: "info";
			info: { name?: string; id?: string; supportsGyro?: boolean };
	  }
	| { type: "battery"; battery: number }
	| { type: "quaternion"; quaternion: Quaternion }
	| { type: "angular"; w: { x: number; y: number; z: number } }
	| { type: "move"; move: string }
	| { type: "facelets"; facelets: string }
	| { type: "disconnect" };

type Listener = (ev: GanEvent) => void;
const listeners = new Set<Listener>();
let conn: GanCubeConnection | null = null;

export function onGanEvents(cb: Listener) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function emit(ev: GanEvent) {
	for (const cb of listeners) cb(ev);
}

export async function connectGanCube() {
	if (conn) return;
	// Provide custom MAC provider to support browsers that can't auto-detect MAC via watchAdvertisements
	const MAC_GLOBAL_KEY = "gan.cube.mac";
	function getStoredMacFor(device: BluetoothDevice): string | null {
		try {
			const byName = device.name
				? localStorage.getItem(`gan.mac.${device.name}`)
				: null;
			const byId = device.id
				? localStorage.getItem(`gan.mac.${device.id}`)
				: null;
			const global = localStorage.getItem(MAC_GLOBAL_KEY);
			return byName || byId || global;
		} catch {
			return null;
		}
	}
	function setStoredMacFor(device: BluetoothDevice, mac: string) {
		try {
			if (device.name) localStorage.setItem(`gan.mac.${device.name}`, mac);
			if (device.id) localStorage.setItem(`gan.mac.${device.id}`, mac);
			localStorage.setItem(MAC_GLOBAL_KEY, mac);
		} catch {}
	}
	// Matches MacAddressProvider: (device: BluetoothDevice, isFallbackCall?: boolean)
	const provider = async (
		device: BluetoothDevice,
		isFallbackCall?: boolean,
	): Promise<string | null> => {
		// First try any stored MAC values without user interaction
		const stored = getStoredMacFor(device);
		if (stored && !isFallbackCall) return stored;
		// On fallback phase, ask the user explicitly
		if (isFallbackCall) {
			const example = "AA:BB:CC:DD:EE:FF";
			const entered =
				typeof window !== "undefined"
					? window.prompt(
							`Enter your GAN cube MAC address (format ${example}).\nThis is needed on some browsers where MAC can't be auto-detected.`,
							stored || "",
						)
					: null;
			if (!entered) return null;
			// Normalize and validate
			const mac = entered.trim().toUpperCase();
			const valid = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/.test(mac);
			if (!valid) return null;
			setStoredMacFor(device, mac);
			return mac;
		}
		return null;
	};

	conn = await libConnectGanCube(provider);
	// Populate basic info
	emit({
		type: "info",
		info: { name: conn.deviceName, id: conn.deviceMAC, supportsGyro: true },
	});
	// Request basic info to seed UI
	try {
		await conn.sendCubeCommand({ type: "REQUEST_HARDWARE" });
		await conn.sendCubeCommand({ type: "REQUEST_FACELETS" });
		await conn.sendCubeCommand({ type: "REQUEST_BATTERY" });
	} catch {}
	// Subscribe to stream
	conn.events$.subscribe((event: GanCubeEvent) => {
		if (event.type === "BATTERY") {
			emit({ type: "battery", battery: event.batteryLevel });
		} else if (event.type === "GYRO" && event.quaternion) {
			const q = event.quaternion;
			emit({
				type: "quaternion",
				quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
			});
			// Some environments provide angularVelocity alongside quaternion
			// biome-ignore lint/suspicious/noExplicitAny: upstream type doesn't expose optional field
			const evAny: any = event;
			if (evAny?.angularVelocity) {
				const w = evAny.angularVelocity as { x: number; y: number; z: number };
				emit({ type: "angular", w });
			}
		} else if (event.type === "MOVE" && event.move) {
			emit({ type: "move", move: event.move });
		} else if (event.type === "FACELETS" && event.facelets) {
			emit({ type: "facelets", facelets: event.facelets });
		} else if (event.type === "DISCONNECT") {
			emit({ type: "disconnect" });
			conn = null;
		}
	});
}

export async function disconnectGanCube() {
	if (!conn) return;
	try {
		conn.disconnect();
	} finally {
		conn = null;
		emit({ type: "disconnect" });
	}
}
export type BatteryInfo = { level: number };
export function connect() {
	/* TODO: BLE connect */
}
export function disconnect() {
	/* TODO: BLE disconnect */
}
export function enableGyro(_: boolean) {
	/* TODO */
}
