import { Show } from "solid-js";
import { device } from "@/stores/device";

interface Props {
	class?: string;
}

export default function DeviceInfoGrid(props: Props) {
	return (
		<div class={`grid grid-cols-2 gap-2 text-sm ${props.class ?? ""}`}>
			<div class="text-gray-500">Name</div>
			<div>{device.info.name || "—"}</div>
			<div class="text-gray-500">MAC</div>
			<div>{device.info.id || "—"}</div>
			<div class="text-gray-500">Gyro</div>
			<div>{device.info.supportsGyro ? "Yes" : "—"}</div>
			<div class="text-gray-500">Battery</div>
			<div>{device.info.battery != null ? `${device.info.battery}%` : "—"}</div>
			<div class="text-gray-500">Quaternion</div>
			<div>
				<Show when={device.quaternion} fallback={<span>—</span>}>
					x: {device.quaternion!.x.toFixed(3)}, y:{" "}
					{device.quaternion!.y.toFixed(3)}, z:{" "}
					{device.quaternion!.z.toFixed(3)}, w:{" "}
					{device.quaternion!.w.toFixed(3)}
				</Show>
			</div>
			<div class="text-gray-500">Ang. Velocity</div>
			<div>
				<Show when={device.angularVelocity} fallback={<span>—</span>}>
					x: {device.angularVelocity!.x.toFixed(3)}, y:{" "}
					{device.angularVelocity!.y.toFixed(3)}, z:{" "}
					{device.angularVelocity!.z.toFixed(3)}
				</Show>
			</div>
		</div>
	);
}
