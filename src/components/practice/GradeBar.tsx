import { For } from "solid-js";
import type { Rating } from "@/services/scheduler/fsrs";

const buttons = [
	{
		key: "again",
		label: "Again",
		title: "1",
		rating: 1 as Rating,
		cls: "bg-rose-600 hover:bg-rose-700",
	},
	{
		key: "hard",
		label: "Hard",
		title: "2",
		rating: 2 as Rating,
		cls: "bg-amber-600 hover:bg-amber-700",
	},
	{
		key: "good",
		label: "Good",
		title: "3",
		rating: 3 as Rating,
		cls: "bg-emerald-600 hover:bg-emerald-700",
	},
	{
		key: "easy",
		label: "Easy",
		title: "4",
		rating: 4 as Rating,
		cls: "bg-blue-600 hover:bg-blue-700",
	},
];

interface Props {
	disabled?: boolean;
	onGrade: (r: Rating) => void;
}

export default function GradeBar(props: Props) {
	return (
		<>
			<div class="flex items-center justify-center gap-2">
				<For each={buttons}>
					{(b) => (
						<button
							class={`px-3 py-2 rounded text-white text-sm ${b.cls}`}
							disabled={props.disabled}
							onClick={() => props.onGrade(b.rating)}
							title={b.title}
						>
							{b.label}
						</button>
					)}
				</For>
			</div>
			<div class="text-xs text-center mt-1 opacity-70">
				Grade this review (Again/Hard/Good/Easy)
			</div>
		</>
	);
}
