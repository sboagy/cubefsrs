import { createEffect, createSignal, Show } from "solid-js";
import { algs, updateCase } from "@/stores/algs";
import { practice } from "@/stores/practice";

export default function PracticeNotes() {
	const [showRecognition, setShowRecognition] = createSignal(true);
	const [showMnemonic, setShowMnemonic] = createSignal(true);
	const [showNotes, setShowNotes] = createSignal(true);
	const [recognition, setRecognition] = createSignal("");
	const [mnemonic, setMnemonic] = createSignal("");
	const [notes, setNotes] = createSignal("");

	createEffect(() => {
		const id = practice.currentId;
		if (!id) {
			setRecognition("");
			setMnemonic("");
			setNotes("");
			return;
		}
		const c = algs.cases[id];
		setRecognition(c?.recognition ?? "");
		setMnemonic(c?.mnemonic ?? "");
		setNotes(c?.notes ?? "");
	});

	function save() {
		const id = practice.currentId;
		if (!id) return;
		updateCase(id, {
			recognition: recognition(),
			mnemonic: mnemonic(),
			notes: notes(),
		});
	}

	return (
		<div class="space-y-2">
			<div class="flex gap-3 text-sm">
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={showRecognition()}
						onChange={(e) =>
							setShowRecognition((e.target as HTMLInputElement).checked)
						}
					/>
					Recognition
				</label>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={showMnemonic()}
						onChange={(e) =>
							setShowMnemonic((e.target as HTMLInputElement).checked)
						}
					/>
					Mnemonic
				</label>
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={showNotes()}
						onChange={(e) =>
							setShowNotes((e.target as HTMLInputElement).checked)
						}
					/>
					Notes
				</label>
			</div>
			<div class="grid md:grid-cols-3 gap-4">
				<Show when={showRecognition()}>
					<textarea
						class="rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 h-24"
						placeholder="Recognition"
						value={recognition()}
						onInput={(e) =>
							setRecognition((e.target as HTMLTextAreaElement).value)
						}
						onBlur={save}
					/>
				</Show>
				<Show when={showMnemonic()}>
					<textarea
						class="rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 h-24"
						placeholder="Mnemonic"
						value={mnemonic()}
						onInput={(e) =>
							setMnemonic((e.target as HTMLTextAreaElement).value)
						}
						onBlur={save}
					/>
				</Show>
				<Show when={showNotes()}>
					<textarea
						class="rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 h-24"
						placeholder="Notes"
						value={notes()}
						onInput={(e) => setNotes((e.target as HTMLTextAreaElement).value)}
						onBlur={save}
					/>
				</Show>
			</div>
		</div>
	);
}
