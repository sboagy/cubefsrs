import type { JSX } from "solid-js";

interface Props {
	onSave: () => void;
	onCancel: () => void;
	children?: JSX.Element;
}

export default function SaveActions(props: Props) {
	return (
		<div class="flex justify-end items-center gap-3">
			<span class="text-sm text-gray-500">{props.children ?? "Ready"}</span>
			<button
				class="px-4 py-2 rounded bg-gray-200 dark:bg-gray-800"
				onClick={props.onCancel}
			>
				Cancel
			</button>
			<button
				class="px-4 py-2 rounded bg-blue-600 text-white"
				onClick={props.onSave}
			>
				Save
			</button>
		</div>
	);
}
