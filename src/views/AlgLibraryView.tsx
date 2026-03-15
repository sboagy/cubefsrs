import { createMemo, createSignal, For, Show } from "solid-js";
import CaseThumb from "@/components/practice/CaseThumb";
import {
	algs,
	allCategories,
	currentCategoryObj,
	currentSubsets,
	deleteCase,
	deselectSubset,
	exportToJson,
	importFromJson,
	isSelected,
	resetToDefaults,
	selectSubset,
	setCategory,
	setOptions,
	toggleCase,
	updateFromDefaults,
} from "@/stores/algs";
import { ensureCard, refreshQueue } from "@/stores/fsrs";
import { clearTimes, practice, setOrderMode, visit } from "@/stores/practice";

type StrategyValue =
	| "fsrs"
	| "random"
	| "slowFirst"
	| "prioritizeFailed"
	| "sequential";

const strategies: { value: StrategyValue; label: string }[] = [
	{ value: "fsrs", label: "Spaced Repetition (FSRS)" },
	{ value: "random", label: "Random" },
	{ value: "slowFirst", label: "Slow Cases First" },
	{ value: "prioritizeFailed", label: "Prioritize Failed" },
	{ value: "sequential", label: "Sequential" },
];

export default function AlgLibraryView() {
	const [deleteMode, setDeleteMode] = createSignal(false);
	const [deleteTimesMode, setDeleteTimesMode] = createSignal(false);
	const [statusMessage, setStatusMessage] = createSignal("");

	const allCaseIds = createMemo(() => {
		return currentSubsets().flatMap((s) => s.caseIds);
	});

	const currentStrategy = createMemo<StrategyValue>(() => {
		if (practice.orderMode === "fsrs") return "fsrs";
		if (practice.orderMode === "random") return "random";
		if (algs.options.slowFirst) return "slowFirst";
		if (algs.options.prioritizeFailed) return "prioritizeFailed";
		return "sequential";
	});

	function subsetAllSelected(subsetName: string) {
		const cat = currentCategoryObj();
		const subset = cat?.subsets.find((s) => s.name === subsetName);
		if (!subset) return false;
		return subset.caseIds.every((id) => isSelected(id));
	}

	function onSubsetToggle(subsetName: string, checked: boolean) {
		if (checked) selectSubset(subsetName);
		else deselectSubset(subsetName);
	}

	function tileClass(id: string) {
		if (deleteMode()) return "border-red-300 hover:bg-red-50";
		return isSelected(id) ? "ring-2 ring-blue-500" : "";
	}

	function onCaseClick(id: string) {
		if (deleteMode()) {
			deleteCase(id);
			setStatusMessage(`Deleted ${id}`);
			setTimeout(() => setStatusMessage(""), 2000);
		} else if (deleteTimesMode()) {
			clearTimes(id);
			setStatusMessage(`Cleared times for ${id}`);
			setTimeout(() => setStatusMessage(""), 2000);
		} else {
			toggleCase(id);
		}
	}

	function reviewNow(id: string) {
		ensureCard(id);
		refreshQueue();
		visit(id);
	}

	function exportAlgs() {
		const data = exportToJson();
		const blob = new Blob([data], { type: "application/json" });
		const url = URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = "alg-catalog.json";
		a.click();
		URL.revokeObjectURL(url);
	}

	function importAlgsFile(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			try {
				importFromJson(String(reader.result));
			} catch {
				// ignore invalid json
			}
		};
		reader.readAsText(file);
	}

	function onStrategyChange(next: StrategyValue) {
		switch (next) {
			case "fsrs":
				setOrderMode("fsrs");
				setOptions({
					randomOrder: false,
					slowFirst: false,
					prioritizeFailed: false,
				});
				break;
			case "random":
				setOrderMode("random");
				setOptions({
					randomOrder: true,
					slowFirst: false,
					prioritizeFailed: false,
				});
				break;
			case "slowFirst":
				setOrderMode("sequential");
				setOptions({
					randomOrder: false,
					slowFirst: true,
					prioritizeFailed: false,
				});
				break;
			case "prioritizeFailed":
				setOrderMode("sequential");
				setOptions({
					randomOrder: false,
					slowFirst: false,
					prioritizeFailed: true,
				});
				break;
			case "sequential":
				setOrderMode("sequential");
				setOptions({
					randomOrder: false,
					slowFirst: false,
					prioritizeFailed: false,
				});
				break;
		}
	}

	return (
		<div class="space-y-4">
			<h1 class="text-2xl font-semibold">Algorithm Library</h1>
			<p class="text-sm opacity-80">Browse and select cases to practice.</p>

			<div class="flex flex-wrap gap-3 items-center">
				<label class="text-sm" for="category-select">
					Category
				</label>
				<select
					id="category-select"
					class="rounded border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 p-2 text-sm"
					value={algs.currentCategory}
					onChange={(e) => setCategory((e.target as HTMLSelectElement).value)}
				>
					<For each={allCategories()}>
						{(c) => <option value={c.name}>{c.name}</option>}
					</For>
				</select>

				<div class="flex items-center gap-2 ml-auto">
					<button type="button" class="btn" onClick={exportAlgs}>
						Export
					</button>
					<label class="btn cursor-pointer">
						<input type="file" class="hidden" onChange={importAlgsFile} />
						Import
					</label>
					<button type="button" class="btn" onClick={() => resetToDefaults()}>
						Reset
					</button>
					<button
						type="button"
						class="btn"
						onClick={() => updateFromDefaults()}
					>
						Update
					</button>
				</div>
			</div>

			<div class="grid md:grid-cols-[220px_1fr] gap-6">
				<aside class="space-y-2">
					<div class="font-medium">Subsets</div>
					<div class="space-y-1">
						<For each={currentSubsets()}>
							{(s) => (
								<div class="flex items-center justify-between gap-2">
									<label class="flex items-center gap-2 text-sm cursor-pointer">
										<input
											type="checkbox"
											checked={subsetAllSelected(s.name)}
											onChange={(e) =>
												onSubsetToggle(
													s.name,
													(e.target as HTMLInputElement).checked,
												)
											}
										/>
										<span>{s.name}</span>
									</label>
								</div>
							)}
						</For>
					</div>

					<div class="pt-3 border-t border-gray-200 dark:border-gray-800 space-y-2">
						<div class="font-medium">Options</div>
						<label class="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={algs.options.randomAUF}
								onChange={(e) =>
									setOptions({
										randomAUF: (e.target as HTMLInputElement).checked,
									})
								}
							/>
							Random AUF
						</label>
						<div class="mt-3 space-y-1">
							<div class="text-xs font-medium opacity-80">
								Ordering Strategy
							</div>
							<For each={strategies}>
								{(s) => (
									<div class="flex items-center gap-2 text-sm">
										<input
											type="radio"
											class="cursor-pointer"
											id={`strategy-${s.value}`}
											name="ordering-strategy"
											value={s.value}
											checked={currentStrategy() === s.value}
											onChange={() => onStrategyChange(s.value)}
										/>
										<label for={`strategy-${s.value}`} class="cursor-pointer">
											{s.label}
										</label>
									</div>
								)}
							</For>
						</div>
					</div>
				</aside>

				<section>
					<div class="flex items-center justify-between mb-2">
						<div class="flex items-center gap-2 text-sm">
							<label class="flex items-center gap-1">
								<input
									type="checkbox"
									checked={deleteMode()}
									onChange={(e) =>
										setDeleteMode((e.target as HTMLInputElement).checked)
									}
								/>
								Delete mode
							</label>
							<label class="flex items-center gap-1">
								<input
									type="checkbox"
									checked={deleteTimesMode()}
									onChange={(e) =>
										setDeleteTimesMode((e.target as HTMLInputElement).checked)
									}
								/>
								Delete times
							</label>
						</div>
						<Show when={statusMessage()}>
							<div class="text-sm text-red-600">{statusMessage()}</div>
						</Show>
					</div>

					<div class="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
						<For each={allCaseIds()}>
							{(id) => (
								<div
									class={`p-2 rounded border border-gray-200 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900 ${tileClass(id)}`}
									title={algs.cases[id]?.alg}
								>
									<button
										type="button"
										class="w-full text-left"
										onClick={() => onCaseClick(id)}
									>
										<CaseThumb
											name={algs.cases[id]?.name || id}
											alg={algs.cases[id]?.alg || ""}
											category={algs.currentCategory}
										/>
									</button>
									<div class="mt-2 flex items-center justify-between">
										<label class="flex items-center gap-2 text-xs">
											<input
												type="checkbox"
												checked={isSelected(id)}
												onChange={() => toggleCase(id)}
											/>
											Enabled
										</label>
										<button
											type="button"
											class="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
											onClick={(e) => {
												e.stopPropagation();
												reviewNow(id);
											}}
										>
											Review Now
										</button>
									</div>
								</div>
							)}
						</For>
					</div>
				</section>
			</div>
		</div>
	);
}
