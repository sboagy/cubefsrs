import { useNavigate } from "@solidjs/router";
import {
	createEffect,
	createMemo,
	createSignal,
	For,
	onCleanup,
	onMount,
	Show,
	untrack,
} from "solid-js";
import AlgorithmRow from "@/components/practice/AlgorithmRow";
import ControlBar from "@/components/practice/ControlBar";
import CubeViewer from "@/components/practice/CubeViewer";
import GradeBar from "@/components/practice/GradeBar";
import PracticeNotes from "@/components/practice/PracticeNotes";
import { mapTokenByZ2 } from "@/lib/orientationMap";
import type { Rating } from "@/services/scheduler/fsrs";
import { algs, currentSubsets } from "@/stores/algs";
import { device } from "@/stores/device";
import {
	ensureCard,
	fsrs,
	popNext,
	refreshQueue,
	reviewCase,
} from "@/stores/fsrs";
import { orientationMode } from "@/stores/orientation";
import {
	clearCurrent,
	currentTimes,
	cycleVisibility,
	goNext,
	goPrev,
	practice,
	resetRun,
	startPractice,
	stopPractice,
	visit,
} from "@/stores/practice";
import { settings } from "@/stores/settings";
import {
	ingestMove,
	resetTracking,
	segmentStates,
	setAlgorithm,
	tracking,
} from "@/stores/tracking";

function segmentClass(state: string) {
	return [
		"inline-block",
		state === "past" && "text-green-600 dark:text-green-400",
		state === "current" && "text-white bg-indigo-600 rounded px-1",
		state === "future" && "text-gray-700 dark:text-gray-300",
		state === "error" && "text-red-600 dark:text-red-400",
		state === "partial" && "text-blue-600 dark:text-blue-400",
	]
		.filter(Boolean)
		.join(" ");
}

function obscureMove(move: string) {
	return move.replace(/[A-Za-z]/g, "•");
}

function pickRandomAuf(): string {
	const opts = ["", "U", "U2", "U'"];
	return opts[Math.floor(Math.random() * opts.length)]!;
}

export default function PracticeView() {
	const navigate = useNavigate();
	const [trainNonce, setTrainNonce] = createSignal(0);
	const [_auf, setAuf] = createSignal("");
	const [runningMs, setRunningMs] = createSignal(0);
	let lastAufCaseId: string | null = null;
	let ticker: ReturnType<typeof setInterval> | null = null;

	const baseAlg = createMemo(() => {
		const id = practice.currentId;
		if (!id) return "";
		return (algs.cases[id]?.alg ?? "").trim();
	});

	// Prepend AUF prefix to the base algorithm when randomAUF is enabled.
	// This memo is the canonical algorithm used for both tracking and CubeViewer.
	const aufAlg = createMemo(() => {
		const auf = _auf();
		const base = baseAlg();
		if (!auf || !algs.options.randomAUF) return base;
		return `${auf} ${base}`.trim();
	});

	const emptyState = createMemo(
		() => fsrs.queue.length === 0 && !practice.currentId,
	);

	const lastMsDisplay = createMemo(() => {
		const t = currentTimes()[0];
		return t?.ms ? `${(t.ms / 1000).toFixed(2)}s` : "0.00s";
	});

	const showGradeBar = createMemo(
		() => practice.orderMode === "fsrs" && !!practice.currentId,
	);

	const isSolved = createMemo(
		() =>
			tracking.userAlg.length > 0 &&
			tracking.badAlg.length === 0 &&
			tracking.currentMoveIndex >= tracking.userAlg.length - 1,
	);

	const timerDisplay = createMemo(() => {
		if (practice.running) return `${(runningMs() / 1000).toFixed(2)}s`;
		return tracking.currentMoveIndex === -1 ? "0.00s" : lastMsDisplay();
	});

	function pickNextId(): string | null {
		if (practice.orderMode === "fsrs") {
			return popNext() ?? null;
		}
		let selected = [...algs.selectedIds];
		if (!selected.length) return null;
		const opts = algs.options;
		if (opts.prioritizeFailed) {
			const worse: string[] = [];
			const rest: string[] = [];
			for (const id of selected) {
				const times = practice.timesById[id] ?? [];
				if (!times.length) worse.push(id);
				else {
					const last = times[0]?.ms ?? 0;
					const avg = Math.round(
						times.reduce((a, t) => a + t.ms, 0) / times.length,
					);
					if (last >= avg) worse.push(id);
					else rest.push(id);
				}
			}
			selected = [...worse, ...rest];
		}
		if (opts.slowFirst) {
			selected.sort((a, b) => {
				const ta = practice.timesById[a] ?? [];
				const tb = practice.timesById[b] ?? [];
				const avga = ta.length
					? ta.reduce((s, t) => s + t.ms, 0) / ta.length
					: 0;
				const avgb = tb.length
					? tb.reduce((s, t) => s + t.ms, 0) / tb.length
					: 0;
				return avgb - avga;
			});
		}
		if (practice.orderMode === "random" || opts.randomOrder) {
			return selected[Math.floor(Math.random() * selected.length)] ?? null;
		}
		const cur = practice.currentId;
		if (!cur) return selected[0] ?? null;
		const idx = selected.indexOf(cur);
		const nextIdx = idx >= 0 ? (idx + 1) % selected.length : 0;
		return selected[nextIdx] ?? null;
	}

	function prev() {
		goPrev();
	}

	function next() {
		if (practice.historyIndex < practice.history.length - 1) {
			goNext();
		} else {
			const id = pickNextId();
			if (id) visit(id);
		}
	}

	function refresh() {
		if (practice.orderMode === "fsrs") {
			for (const id of algs.selectedIds) ensureCard(id);
			refreshQueue();
		}
		if (!practice.currentId) {
			const id = pickNextId();
			if (id) visit(id);
		}
	}

	function train() {
		setTrainNonce((n) => n + 1);
		resetTracking();
		resetRun();
		setRunningMs(0);
	}

	function editCurrent() {
		if (!practice.currentId) return;
		const c = algs.cases[practice.currentId];
		const q: Record<string, string> = {};
		if (c) {
			q.category = algs.currentCategory || "";
			const ss = currentSubsets().find((s) => s.caseIds.includes(c.id));
			if (ss) q.subset = ss.name;
			q.name = c.name;
			q.alg = c.alg;
		}
		const qs = new URLSearchParams(q).toString();
		navigate(`/new?${qs}`);
	}

	function onGrade(rating: Rating) {
		if (!practice.currentId) return;
		reviewCase(practice.currentId, rating);
		const nextId = popNext();
		if (nextId) visit(nextId);
		else clearCurrent();
	}

	// Bridge device moves → tracking
	createEffect(() => {
		// Mirror the viewer logic: one tracking ingest per timestamp edge, even when Solid updates the payload separately.
		const moveAt = device.lastMoveAt;
		const mv = untrack(() => device.lastMove);
		if (moveAt == null) return;
		if (!mv) return;
		untrack(() => {
			if (!practice.running && practice.currentId && !isSolved()) {
				setRunningMs(0);
				startPractice();
			}
			// Single translation point: hardware move → logical move (z2 for yellow-up)
			// 1. src/services/ganBluetooth.ts receives `MOVE` events from
			//    `gan-web-bluetooth` and emits `{ type: "move", move }`.
			// 2. src/stores/device.ts subscribes via `onGanEvents(...)` and
			//    writes `device.lastMove` plus `device.lastMoveAt`.
			// 3. src/views/PracticeView.tsx reacts to that store edge and does
			//    the logical translation before calling `ingestMove(...)`.
			// 4. src/components/practice/CubeViewer.tsx separately reacts to
			//    the same raw store edge for display and applies the same z2
			//    mapping for `experimentalAddMove(...)`.
			const logical =
				orientationMode() === "yellow-up" ? mapTokenByZ2(mv.trim()) : mv.trim();
			ingestMove(logical);
		});
	});

	createEffect(() => {
		if (!practice.running) return;
		if (!isSolved()) return;
		untrack(() => stopPractice());
	});

	// Keep tracking algorithm in sync when case changes (including AUF prefix)
	createEffect(() => {
		const alg = aufAlg();
		if (!alg) return;
		// This effect also handles the initial mount. Re-applying the same algorithm
		// after a move would reset tracking back to the first letter.
		if (alg === untrack(() => tracking.rawAlg)) return;
		setAlgorithm(alg);
	});

	createEffect(() => {
		const currentId = practice.currentId;
		const randomAufEnabled = algs.options.randomAUF;

		if (!currentId) {
			lastAufCaseId = null;
			if (_auf()) setAuf("");
			return;
		}

		if (!randomAufEnabled) {
			lastAufCaseId = null;
			if (_auf()) setAuf("");
			return;
		}

		if (lastAufCaseId === currentId) return;
		lastAufCaseId = currentId;
		setAuf(pickRandomAuf());
	});

	createEffect(() => {
		if (practice.orderMode !== "fsrs") return;
		if (practice.currentId) return;
		if (fsrs.queue.length === 0) return;

		const nextId = popNext();
		if (nextId) visit(nextId);
	});

	onMount(() => {
		ticker = setInterval(() => {
			if (practice.running && practice.startAt) {
				setRunningMs(Date.now() - practice.startAt);
			}
		}, 50);

		if (practice.orderMode === "fsrs") {
			for (const id of algs.selectedIds) ensureCard(id);
			refreshQueue();
			if (!practice.currentId) {
				const id = popNext();
				if (id) visit(id);
			}
		}
	});

	onCleanup(() => {
		if (ticker !== null) clearInterval(ticker);
	});

	const segs = createMemo(() => segmentStates());

	return (
		<div class="space-y-4">
			<h1 class="text-2xl font-semibold">Practice</h1>
			<div class="grid md:grid-cols-3 gap-4 items-start">
				<div class="space-y-2">
					<div class="text-sm opacity-80">
						Status:{" "}
						<span class={device.connected ? "text-green-600" : "opacity-80"}>
							{device.connected ? "Connected" : "Not connected"}
						</span>
					</div>
					<Show when={device.info.name}>
						<div>Name: {device.info.name}</div>
					</Show>
					<Show when={device.info.battery != null}>
						<div>Battery: {device.info.battery}%</div>
					</Show>
				</div>

				<div class="flex flex-col items-center">
					<CubeViewer alg={aufAlg()} trainNonce={trainNonce()} />
					<Show when={emptyState()}>
						<div class="mt-2 text-sm text-gray-500">No Cases Scheduled</div>
					</Show>
				</div>

				<div class="text-4xl font-mono tabular-nums text-center">
					<div>{timerDisplay()}</div>
				</div>
			</div>

			<div class="relative mt-4">
				<div class="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-4">
					<Show when={practice.orderMode === "fsrs"}>
						<button
							type="button"
							class="w-10 h-10 flex items-center justify-center rounded-full bg-indigo-600 text-white"
							onClick={refresh}
							aria-label="Check Scheduled"
							title="Check Scheduled"
						>
							<span aria-hidden="true">↻</span>
						</button>
						<div class="text-sm opacity-80 whitespace-nowrap select-none">
							Due: <span class="font-medium">{fsrs.queue.length}</span>
						</div>
					</Show>
				</div>
				<div class="flex justify-center">
					<ControlBar onPrev={prev} onTrain={train} onNext={next} />
				</div>
			</div>

			<AlgorithmRow onCycleVisibility={cycleVisibility} onEdit={editCurrent}>
				<span class="font-mono whitespace-pre">
					<Show
						when={practice.visibility !== "hidden"}
						fallback={<span>••••••••</span>}
					>
						<For each={segs()}>
							{(seg, _si) => (
								<>
									{seg.state ? (
										<span class={segmentClass(seg.state)}>
											{practice.visibility === "full"
												? seg.text
												: obscureMove(seg.text)}
										</span>
									) : (
										seg.text
									)}
								</>
							)}
						</For>
					</Show>
				</span>
			</AlgorithmRow>

			<Show when={showGradeBar()}>
				<div class="mt-2">
					<GradeBar onGrade={onGrade} />
				</div>
			</Show>

			<Show when={settings.showCaseName && practice.currentId}>
				<div class="text-sm text-gray-500">
					Case: {algs.cases[practice.currentId!]?.name || practice.currentId}
				</div>
			</Show>

			<PracticeNotes />
		</div>
	);
}
