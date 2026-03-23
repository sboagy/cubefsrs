interface Props {
	onPrev: () => void;
	onTrain: () => void;
	onNext: () => void;
}

export default function ControlBar(props: Props) {
	return (
		<div class="flex gap-3">
			<button
				type="button"
				class="px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-800"
				onClick={props.onPrev}
			>
				Prev
			</button>
			<button
				type="button"
				class="px-3 py-2 rounded-full bg-green-600 text-white"
				onClick={props.onTrain}
			>
				Reset
			</button>
			<button
				type="button"
				class="px-3 py-2 rounded-full bg-gray-200 dark:bg-gray-800"
				onClick={props.onNext}
			>
				Next
			</button>
		</div>
	);
}
