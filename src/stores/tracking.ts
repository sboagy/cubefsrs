// Tracking store – SolidJS port of the Vue/Pinia tracking store.
// Non-reactive heavy objects (kpuzzle, pattern states) are kept as module-level
// plain variables to avoid deep reactive wrapping (equivalent to Vue's markRaw).

import { Alg } from "cubing/alg";
import { cube3x3x3 } from "cubing/puzzles";
import { createStore } from "solid-js/store";
import { getInverseMove, getOppositeMove } from "@/lib/legacyMoveHelpers";
import { algs } from "@/stores/algs";

// Minimal shape for the kpuzzle object we need (duck-typed)
interface KPuzzlePatternProvider {
	defaultPattern?: () => PatternLike;
}

interface PatternLike {
	applyMove(m: string): PatternLike;
	isIdentical?(o: unknown): boolean;
}

export interface TrackingToken {
	move: string;
	rendered: string;
	state: "past" | "current" | "error" | "future" | "partial";
	index: number;
}

interface SegmentPiece {
	text: string;
	tokenIndex?: number;
}

type CanonicalKind =
	| "single"
	| "double"
	| "slice"
	| "slice2"
	| "wide"
	| "wide2";

interface CanonicalToken {
	raw: string;
	kind: CanonicalKind;
	components: string[];
	sliceAxis?: "M" | "E" | "S";
}

interface SliceBuffer {
	slice: "M" | "E" | "S";
	first: string;
	halfComplete?: boolean;
}
interface WideBuffer {
	slice: "M" | "E" | "S";
	first: string;
}
interface DoubleBuffer {
	face: string;
	first: string;
	wantsPrime: boolean;
}

function inferSliceQuarterTurn(
	axis: "M" | "E" | "S",
	firstMove: string,
	secondMove: string,
): string | null {
	const first = firstMove.replace(/[()]/g, "");
	const second = secondMove.replace(/[()]/g, "");
	const slicePairs: Record<
		"M" | "E" | "S",
		{ plain: [string, string]; prime: [string, string] }
	> = {
		M: { plain: ["R", "L'"], prime: ["R'", "L"] },
		E: { plain: ["U'", "D"], prime: ["U", "D'"] },
		S: { plain: ["F", "B'"], prime: ["F'", "B"] },
	};
	const matchesPair = ([a, b]: [string, string]) =>
		(first === a && second === b) || (first === b && second === a);
	const pairs = slicePairs[axis];
	if (matchesPair(pairs.plain)) return axis;
	if (matchesPair(pairs.prime)) return `${axis}'`;
	return null;
}

// ---- Module-level non-reactive heavy objects (equivalent to markRaw in Vue) ----
let _kpuzzle: KPuzzlePatternProvider | null = null;
let _currentPattern: PatternLike | null = null;
let _progressPatternRaw: PatternLike | null = null;
let _algPatternStates: PatternLike[] = [];
let _patternStates: PatternLike[] = [];

// ---- Reactive state ----
type TrackingState = {
	rawAlg: string;
	userAlg: string[];
	groupedAlg: (string | { group: string; moves: string[] })[];
	canonical: CanonicalToken[];
	groupIds: (string | null)[];
	ready: boolean;
	currentMoveIndex: number;
	badAlg: string[];
	simplifiedBadAlg: string[];
	pendingSlice: SliceBuffer | null;
	pendingWide: WideBuffer | null;
	pendingDouble: DoubleBuffer | null;
	displayTokens: TrackingToken[];
	isDoubleTurn: boolean;
	isOpposite: boolean;
	isAuf: boolean;
	segments: SegmentPiece[];
	eventTransform: string;
	mistakesJustCleared: boolean;
	pendingMoves: string[];
	patternInitStartedAt: number | null;
	patternsReadyMode: "none" | "fallback" | "kpuzzle";
	acceptedDeviceMoves: string[];
};

const [tracking, setTracking] = createStore<TrackingState>({
	rawAlg: "",
	userAlg: [],
	groupedAlg: [],
	canonical: [],
	groupIds: [],
	ready: false,
	currentMoveIndex: -1,
	badAlg: [],
	simplifiedBadAlg: [],
	pendingSlice: null,
	pendingWide: null,
	pendingDouble: null,
	displayTokens: [],
	isDoubleTurn: false,
	isOpposite: false,
	isAuf: false,
	segments: [],
	eventTransform: "",
	mistakesJustCleared: false,
	pendingMoves: [],
	patternInitStartedAt: null,
	patternsReadyMode: "none",
	acceptedDeviceMoves: [],
});

export { tracking };

function debug(...a: unknown[]) {
	if (localStorage.getItem("cubefsrs.debug.tracking") === "1") {
		console.log("[tracking]", ...a);
	}
}

let _didEarlyCalibration = false;

class SeqPattern implements PatternLike {
	seq: string[];
	constructor(seq: string[] = []) {
		this.seq = seq;
	}
	applyMove(m: string): PatternLike {
		return new SeqPattern([...this.seq, m]);
	}
	isIdentical(o: unknown): boolean {
		if (!o || typeof o !== "object") return false;
		const other = o as { seq?: string[] };
		return (
			Array.isArray(other.seq) && other.seq.join(" ") === this.seq.join(" ")
		);
	}
}

export function resetTracking() {
	setTracking("currentMoveIndex", -1);
	setTracking("badAlg", []);
	setTracking("simplifiedBadAlg", []);
	setTracking("pendingSlice", null);
	setTracking("pendingWide", null);
	setTracking("pendingDouble", null);
	setTracking("displayTokens", []);
	setTracking("isDoubleTurn", false);
	setTracking("isOpposite", false);
	setTracking("isAuf", false);
	setTracking("eventTransform", "");
	setTracking("acceptedDeviceMoves", []);
	if (_currentPattern) _progressPatternRaw = _currentPattern;
	recomputeDisplay();
}

export function setAlgorithm(raw: string) {
	_didEarlyCalibration = false;
	const { expanded, grouped } = parseTokens(raw);
	const canonical = expanded.map(buildCanonical);
	const map: (string | null)[] = [];
	for (const g of grouped) {
		if (typeof g === "string") map.push(null);
		else for (const _ of g.moves) map.push(g.group);
	}
	setTracking("rawAlg", raw.trim());
	setTracking("userAlg", expanded);
	setTracking("groupedAlg", grouped);
	setTracking("canonical", canonical);
	setTracking("groupIds", map);
	setTracking("currentMoveIndex", -1);
	setTracking("badAlg", []);
	setTracking("simplifiedBadAlg", []);
	setTracking("pendingSlice", null);
	setTracking("pendingWide", null);
	setTracking("pendingDouble", null);
	setTracking("eventTransform", "");
	setTracking("acceptedDeviceMoves", []);
	setTracking("segments", parseSegments(raw, expanded.length));
	setTracking("pendingMoves", []);
	setTracking("patternInitStartedAt", Date.now());
	// Reset ready so ensureImmediateReady recomputes pattern states for the
	// new algorithm below (avoids stale _progressPatternRaw / _patternStates
	// from the previous algorithm if initPatterns hasn't resolved yet).
	setTracking("ready", false);
	ensureImmediateReady();
	advancePastRotations();
	void initPatterns();
	setTimeout(() => {
		if (!tracking.ready && tracking.userAlg === expanded) {
			debug("init:timeout-fallback");
			forceReady();
		}
	}, 800);
	recomputeDisplay();
}

function ensureImmediateReady() {
	if (tracking.ready) return;
	const start = new SeqPattern();
	_currentPattern = start;
	_progressPatternRaw = start;
	const raw: PatternLike[] = [];
	const oriented: PatternLike[] = [];
	let cur: PatternLike = start;
	for (const tok of tracking.canonical) {
		for (const comp of tok.components)
			cur = cur.applyMove(comp.replace(/[()]/g, ""));
		raw.push(cur);
		oriented.push(cur);
	}
	_algPatternStates = raw;
	_patternStates = oriented;
	setTracking("ready", true);
	setTracking("patternsReadyMode", "fallback");
	debug("immediate-ready");
}

async function initPatterns() {
	try {
		debug("init:start", { len: tracking.userAlg.length });
		if (!_kpuzzle) {
			_kpuzzle = (await cube3x3x3.kpuzzle()) as KPuzzlePatternProvider;
		}
		debug("init:kpuzzle-resolved");
		const KP = _kpuzzle;
		let start: PatternLike;
		if (KP && typeof KP.defaultPattern === "function") {
			start = KP.defaultPattern() as PatternLike;
		} else {
			start = new SeqPattern();
		}
		_currentPattern = start;
		_progressPatternRaw = start;
		const raw: PatternLike[] = [];
		const oriented: PatternLike[] = [];
		let cur: PatternLike = start;
		for (const tok of tracking.canonical) {
			for (const comp of tok.components)
				cur = cur.applyMove(comp.replace(/[()]/g, ""));
			raw.push(cur);
			oriented.push(cur);
		}
		_algPatternStates = raw;
		_patternStates = oriented;
		setTracking("ready", true);
		setTracking("patternsReadyMode", "kpuzzle");
		if (tracking.pendingMoves.length) {
			const queued = [...tracking.pendingMoves];
			setTracking("pendingMoves", []);
			debug("flushing-pending", queued);
			for (const mv of queued) ingestMove(mv);
		}
	} catch (e) {
		debug("pattern-init-fail", e);
	}
}

function forceReady() {
	if (tracking.ready) return;
	const start = new SeqPattern();
	_currentPattern = start;
	_progressPatternRaw = start;
	const raw: PatternLike[] = [];
	const oriented: PatternLike[] = [];
	let cur: PatternLike = start;
	for (const tok of tracking.canonical) {
		for (const comp of tok.components)
			cur = cur.applyMove(comp.replace(/[()]/g, ""));
		raw.push(cur);
		oriented.push(cur);
	}
	_algPatternStates = raw;
	_patternStates = oriented;
	setTracking("ready", true);
	debug("forceReady:ready-flushed");
	if (tracking.pendingMoves.length) {
		const queued = [...tracking.pendingMoves];
		setTracking("pendingMoves", []);
		for (const mv of queued) ingestMove(mv);
	}
}

// Auto-advance past any rotation tokens (x/y/z) immediately after
// accepting a move, since physical GAN cubes have no gyroscope and the
// user never needs to "perform" a rotation token.
function advancePastRotations() {
	while (true) {
		const nextIdx = tracking.currentMoveIndex + 1;
		const next = tracking.userAlg[nextIdx];
		if (!next) break;
		if (!/^[xyz]['2]?$/i.test(next.replace(/[()]/g, ""))) break;
		_progressPatternRaw = _patternStates[nextIdx] ?? _progressPatternRaw;
		setTracking("currentMoveIndex", nextIdx);
	}
}

export function ingestMove(move: string) {
	if (!tracking.ready || !tracking.userAlg.length) {
		if (tracking.userAlg.length && tracking.patternsReadyMode === "none") {
			debug("autoEnsureReady");
			ensureImmediateReady();
		}
		if (tracking.ready) {
			// continue
		} else {
			setTracking("pendingMoves", [...tracking.pendingMoves, move]);
			debug("queue:not-ready", { ready: tracking.ready, move });
			return;
		}
	}
	const next = tracking.userAlg[tracking.currentMoveIndex + 1];
	if (!next) {
		debug("skip:no-next", {
			idx: tracking.currentMoveIndex,
			total: tracking.userAlg.length,
		});
		return;
	}
	const norm = (m: string) => m.replace(/[()]/g, "");
	let logical = move.trim();
	if (tracking.eventTransform)
		logical = applyRotationToMove(logical, tracking.eventTransform);
	logical = norm(logical);

	if (
		tracking.badAlg.length > 0 &&
		logical ===
			norm(getInverseMove(tracking.badAlg[tracking.badAlg.length - 1]))
	) {
		setTracking("badAlg", tracking.badAlg.slice(0, -1));
		recomputeDisplay();
		return;
	}

	const basePattern = _progressPatternRaw || _currentPattern;
	if (!basePattern) {
		debug("skip:no-basePattern");
		return;
	}
	const nextIndex = tracking.currentMoveIndex + 1;
	const expectedPattern = _patternStates[nextIndex];
	const expectNorm = norm(next);

	// Early rotation calibration
	if (
		tracking.currentMoveIndex === -1 &&
		!tracking.eventTransform &&
		!_didEarlyCalibration
	) {
		const expectedTok = tracking.canonical[0];
		if (expectedTok) {
			const acceptable = new Set<string>();
			for (const comp of expectedTok.components) {
				const base = comp.replace(/[()]/g, "").charAt(0);
				if (base) acceptable.add(base.toUpperCase());
			}
			const logicalLetter = logical.charAt(0).toUpperCase();
			if (!acceptable.has(logicalLetter)) {
				for (const cand of rotationCandidates()) {
					if (!cand) continue;
					let rotated = applyRotationToMove(move, cand);
					rotated = norm(rotated);
					const rLetter = rotated.charAt(0).toUpperCase();
					if (acceptable.has(rLetter)) {
						setTracking("eventTransform", cand);
						logical = rotated;
						_didEarlyCalibration = true;
						break;
					}
				}
			} else {
				_didEarlyCalibration = true;
			}
		}
	}

	// SLICE COMPOSITES (M/E/S)
	const expectedIsSlice = /^(?:M|E|S)(?:2'?|'|2)?$/.test(expectNorm);
	if (expectedIsSlice) {
		const axis = expectNorm[0] as "M" | "E" | "S";
		const axisFace = (mv: string) =>
			axis === "M"
				? /^[LR]/.test(mv[0])
				: axis === "E"
					? /^[UD]/.test(mv[0])
					: /^[FB]/.test(mv[0]);
		const normalizedExpect = expectNorm.replace(/2'$/, "2");
		const isDoubleSlice = normalizedExpect.endsWith("2");
		if (!tracking.pendingSlice && axisFace(logical)) {
			setTracking("pendingSlice", { slice: axis, first: logical });
			debug("slice:buffer", { first: logical, axis, expect: normalizedExpect });
			recomputeDisplay();
			return;
		}
		if (tracking.pendingSlice && tracking.pendingSlice.slice === axis) {
			if (tracking.pendingSlice.halfComplete && !tracking.pendingSlice.first) {
				if (axisFace(logical)) {
					setTracking("pendingSlice", {
						...tracking.pendingSlice,
						first: logical,
					});
					recomputeDisplay();
					return;
				}
			}
			if (!tracking.pendingSlice.halfComplete) {
				if (!isDoubleSlice) {
					const combined = basePattern
						.applyMove(tracking.pendingSlice.first)
						.applyMove(logical) as PatternLike;
					if (expectedPattern?.isIdentical?.(combined)) {
						setTracking("currentMoveIndex", nextIndex);
						_progressPatternRaw = combined;
						setTracking("badAlg", []);
						setTracking("pendingSlice", null);
						setTracking("acceptedDeviceMoves", [
							...tracking.acceptedDeviceMoves,
							move,
						]);
						advancePastRotations();
						recomputeDisplay();
						return;
					}
				}
			}
			const firstTok = tracking.pendingSlice.first.replace(/[()]/g, "");
			const secondTok = logical.replace(/[()]/g, "");
			const dir = (mv: string) =>
				mv.endsWith("'") ? -1 : mv.endsWith("2") ? 2 : 1;
			const d1 = dir(firstTok);
			const d2 = dir(secondTok);
			let inferred = false;
			if (firstTok && Math.abs(d1) === 1 && Math.abs(d2) === 1 && d1 === -d2) {
				const inferredSlice = inferSliceQuarterTurn(axis, firstTok, secondTok);
				inferred = isDoubleSlice
					? inferredSlice !== null
					: inferredSlice === normalizedExpect;
			}
			if (inferred) {
				if (isDoubleSlice) {
					if (!tracking.pendingSlice.halfComplete) {
						setTracking("pendingSlice", {
							...tracking.pendingSlice,
							halfComplete: true,
							first: "",
						});
						recomputeDisplay();
						return;
					} else {
						const applied = basePattern.applyMove(
							normalizedExpect,
						) as PatternLike;
						setTracking("currentMoveIndex", nextIndex);
						_progressPatternRaw = applied;
						setTracking("badAlg", []);
						setTracking("pendingSlice", null);
						setTracking("acceptedDeviceMoves", [
							...tracking.acceptedDeviceMoves,
							move,
						]);
						advancePastRotations();
						recomputeDisplay();
						return;
					}
				} else {
					const applied = basePattern.applyMove(
						normalizedExpect,
					) as PatternLike;
					setTracking("currentMoveIndex", nextIndex);
					_progressPatternRaw = applied;
					setTracking("badAlg", []);
					setTracking("pendingSlice", null);
					setTracking("acceptedDeviceMoves", [
						...tracking.acceptedDeviceMoves,
						move,
					]);
					advancePastRotations();
					recomputeDisplay();
					return;
				}
			}
			if (tracking.pendingSlice.first) {
				const bad = [...tracking.badAlg];
				if (bad[bad.length - 1] !== tracking.pendingSlice.first)
					bad.push(tracking.pendingSlice.first);
				setTracking("badAlg", bad);
				setTracking("pendingSlice", null);
			}
		} else if (isDoubleSlice && !tracking.pendingSlice && axisFace(logical)) {
			setTracking("pendingSlice", { slice: axis, first: logical });
			recomputeDisplay();
			return;
		}
		if (
			tracking.pendingSlice &&
			logical ===
				getInverseMove(tracking.pendingSlice.first.replace(/[()]/g, ""))
		) {
			setTracking("pendingSlice", null);
			recomputeDisplay();
			return;
		}
	}

	// Slice interruption fallback
	if (tracking.pendingSlice) {
		const first = tracking.pendingSlice.first;
		if (
			logical !== first &&
			logical !== getInverseMove(first.replace(/[()]/g, ""))
		) {
			const bad = [...tracking.badAlg];
			if (bad[bad.length - 1] !== first) bad.push(first);
			setTracking("badAlg", bad);
			setTracking("pendingSlice", null);
		}
	}

	// Wide composites
	const ctok = tracking.canonical[nextIndex];
	if (ctok && (ctok.kind === "wide" || ctok.kind === "wide2")) {
		const [outer, sliceComp] = ctok.components;
		if (!tracking.pendingWide && expectedPattern && outer && sliceComp) {
			if (logical === outer || logical === sliceComp) {
				const partner = logical === outer ? sliceComp : outer;
				const virt = basePattern
					.applyMove(logical)
					.applyMove(partner) as PatternLike;
				if (expectedPattern.isIdentical?.(virt)) {
					setTracking("currentMoveIndex", nextIndex);
					_progressPatternRaw = virt;
					setTracking("badAlg", []);
					setTracking("acceptedDeviceMoves", [
						...tracking.acceptedDeviceMoves,
						move,
					]);
					advancePastRotations();
					recomputeDisplay();
					return;
				}
			}
		}
		if (
			!tracking.pendingWide &&
			outer &&
			sliceComp &&
			(logical === sliceComp || logical === outer)
		) {
			const sliceAxis: "M" | "E" | "S" = ctok.sliceAxis || "M";
			setTracking("pendingWide", { slice: sliceAxis, first: logical });
			recomputeDisplay();
			return;
		}
		if (tracking.pendingWide && outer && sliceComp) {
			const first = tracking.pendingWide.first;
			const missing = first === sliceComp ? outer : sliceComp;
			if (logical === missing) {
				const combined = basePattern
					.applyMove(first)
					.applyMove(logical) as PatternLike;
				if (expectedPattern?.isIdentical?.(combined)) {
					setTracking("currentMoveIndex", nextIndex);
					_progressPatternRaw = combined;
					setTracking("badAlg", []);
					setTracking("pendingWide", null);
					setTracking("acceptedDeviceMoves", [
						...tracking.acceptedDeviceMoves,
						move,
					]);
					advancePastRotations();
					recomputeDisplay();
					return;
				}
			} else if (logical !== first) {
				const bad = [...tracking.badAlg];
				if (bad[bad.length - 1] !== first) bad.push(first);
				setTracking("badAlg", bad);
				setTracking("pendingWide", null);
			}
		}
	}

	// Double turn as two quarter turns
	const expectedIsDouble = /^[URFDLB]2'?$/i.test(expectNorm);
	let wrongDirectionQuarterOnExpectedDouble = false;
	if (expectedIsDouble) {
		const face = expectNorm[0]?.toUpperCase() ?? "";
		const wantsPrime = expectNorm.endsWith("'");
		const quarterOk = (mv: string) =>
			mv[0]?.toUpperCase() === face &&
			(wantsPrime ? mv.endsWith("'") : !mv.endsWith("'"));
		wrongDirectionQuarterOnExpectedDouble =
			logical[0]?.toUpperCase() === face &&
			/^[URFDLB]['2]?$/.test(logical) &&
			!logical.endsWith("2") &&
			!quarterOk(logical);
		if (!tracking.pendingDouble && quarterOk(logical)) {
			setTracking("pendingDouble", { face, first: logical, wantsPrime });
			recomputeDisplay();
			return;
		} else if (tracking.pendingDouble && tracking.pendingDouble.face === face) {
			const combined = basePattern
				.applyMove(tracking.pendingDouble.first)
				.applyMove(logical) as PatternLike;
			if (expectedPattern?.isIdentical?.(combined)) {
				setTracking("currentMoveIndex", nextIndex);
				_progressPatternRaw = combined;
				setTracking("badAlg", []);
				setTracking("pendingDouble", null);
				setTracking("acceptedDeviceMoves", [
					...tracking.acceptedDeviceMoves,
					move,
				]);
				advancePastRotations();
				recomputeDisplay();
				return;
			}
			const bad = [...tracking.badAlg];
			if (bad[bad.length - 1] !== tracking.pendingDouble.first)
				bad.push(tracking.pendingDouble.first);
			setTracking("badAlg", bad);
			setTracking("pendingDouble", null);
		} else if (
			tracking.pendingDouble &&
			logical ===
				getInverseMove(tracking.pendingDouble.first.replace(/[()]/g, ""))
		) {
			setTracking("pendingDouble", null);
			recomputeDisplay();
			return;
		} else if (tracking.pendingDouble) {
			const bad = [...tracking.badAlg];
			const first = tracking.pendingDouble.first;
			if (bad[bad.length - 1] !== first) bad.push(first);
			setTracking("badAlg", bad);
			setTracking("pendingDouble", null);
		}
	}

	// Simple single acceptance
	const applied = basePattern.applyMove(logical) as PatternLike;
	if (expectedPattern?.isIdentical?.(applied)) {
		setTracking("currentMoveIndex", nextIndex);
		_progressPatternRaw = applied;
		setTracking("badAlg", []);
		setTracking("acceptedDeviceMoves", [
			...tracking.acceptedDeviceMoves,
			move,
		]);
		advancePastRotations();
		recomputeDisplay();
		return;
	}
	debug("single-miss", { logical, expect: expectNorm });

	// Rotation calibration (dynamic)
	if (!tracking.eventTransform) {
		for (const cand of rotationCandidates()) {
			if (!cand) continue;
			let test = applyRotationToMove(move, cand);
			test = norm(test);
			const testApplied = basePattern.applyMove(test) as PatternLike;
			if (expectedPattern?.isIdentical?.(testApplied)) {
				setTracking("eventTransform", cand);
				setTracking("currentMoveIndex", nextIndex);
				_progressPatternRaw = testApplied;
				setTracking("badAlg", []);
				setTracking("acceptedDeviceMoves", [
					...tracking.acceptedDeviceMoves,
					move,
				]);
				advancePastRotations();
				recomputeDisplay();
				return;
			}
		}
	}

	// Rotation refinement
	if (
		tracking.eventTransform &&
		tracking.currentMoveIndex >= 0 &&
		tracking.badAlg.length <= 1
	) {
		const refine = ["x", "x'", "x2", "y", "y'", "y2", "z", "z'", "z2"];
		const basePatternRef = _progressPatternRaw || _currentPattern;
		for (const r of refine) {
			const combo = `${tracking.eventTransform} ${r}`.trim();
			let test = applyRotationToMove(move, combo);
			test = norm(test);
			const testApplied = (basePatternRef as PatternLike).applyMove(
				test,
			) as PatternLike;
			if (expectedPattern?.isIdentical?.(testApplied)) {
				setTracking("eventTransform", combo);
				setTracking("currentMoveIndex", nextIndex);
				_progressPatternRaw = testApplied;
				setTracking("badAlg", []);
				setTracking("acceptedDeviceMoves", [
					...tracking.acceptedDeviceMoves,
					move,
				]);
				advancePastRotations();
				recomputeDisplay();
				return;
			}
		}
	}

	// Backtracking
	if (tracking.badAlg.length === 0 && tracking.currentMoveIndex >= 0) {
		const last = tracking.userAlg[tracking.currentMoveIndex];
		if (last && logical === norm(getInverseMove(last))) {
			const newIdx = tracking.currentMoveIndex - 1;
			setTracking("currentMoveIndex", newIdx);
			_progressPatternRaw =
				newIdx >= 0 ? (_algPatternStates[newIdx] ?? null) : _currentPattern;
			recomputeDisplay();
			return;
		}
	}

	// Late wide rescue
	if (
		ctok &&
		(ctok.kind === "wide" || ctok.kind === "wide2") &&
		expectedPattern
	) {
		const [outer, sliceComp] = ctok.components;
		if (outer && sliceComp) {
			for (const cand of rotationCandidates()) {
				let rotated = applyRotationToMove(move, cand);
				rotated = norm(rotated);
				if (rotated === outer || rotated === sliceComp) {
					const partner = rotated === outer ? sliceComp : outer;
					const virt = basePattern
						.applyMove(rotated)
						.applyMove(partner) as PatternLike;
					if (expectedPattern.isIdentical?.(virt)) {
						setTracking("eventTransform", cand);
						setTracking("currentMoveIndex", nextIndex);
						_progressPatternRaw = virt;
						setTracking("badAlg", []);
						setTracking("acceptedDeviceMoves", [
							...tracking.acceptedDeviceMoves,
							move,
						]);
						advancePastRotations();
						recomputeDisplay();
						return;
					}
				}
			}
		}
	}

	// Record mistake
	const bad = [...tracking.badAlg];
	if (
		bad[bad.length - 1] !== logical ||
		wrongDirectionQuarterOnExpectedDouble
	)
		bad.push(logical);
	if (bad.length > 4) bad.splice(0, bad.length - 4);
	setTracking("badAlg", bad);
	recomputeDisplay();
}

function buildCanonical(raw: string): CanonicalToken {
	const wide = /^[rufldb](?:['2])?$/;
	const slice = /^(?:M|E|S)(?:2'?|'|2)?$/;
	if (wide.test(raw) && raw[0] === raw[0]?.toLowerCase()) {
		const base = raw[0];
		const suf = raw.slice(1);
		const map: Record<
			string,
			{
				plain: [string, string];
				prime: [string, string];
				two: [string, string];
			}
		> = {
			f: { plain: ["F", "S'"], prime: ["F'", "S"], two: ["F2", "S2"] },
			r: { plain: ["R", "M'"], prime: ["R'", "M"], two: ["R2", "M2"] },
			u: { plain: ["U", "E'"], prime: ["U'", "E"], two: ["U2", "E2"] },
			l: { plain: ["L", "M"], prime: ["L'", "M'"], two: ["L2", "M2"] },
			d: { plain: ["D", "E"], prime: ["D'", "E'"], two: ["D2", "E2"] },
			b: { plain: ["B", "S"], prime: ["B'", "S'"], two: ["B2", "S2"] },
		};
		const row = map[base ?? ""];
		let components: string[] = [];
		if (row) {
			if (suf === "") components = row.plain;
			else if (suf === "'") components = row.prime;
			else if (suf === "2") components = row.two;
		}
		const sliceMove = components[1] || "";
		const axisChar = sliceMove[0];
		const axis =
			axisChar === "M" || axisChar === "E" || axisChar === "S"
				? axisChar
				: undefined;
		return {
			raw,
			kind: suf === "2" ? "wide2" : "wide",
			components,
			sliceAxis: axis,
		};
	}
	if (slice.test(raw)) {
		const axis = raw[0] as "M" | "E" | "S";
		let suf = raw.slice(1);
		if (suf === "2'") suf = "2";
		const normRaw = axis + suf;
		return {
			raw: normRaw,
			kind: suf === "2" ? "slice2" : "slice",
			components: [normRaw],
			sliceAxis: axis,
		};
	}
	if (/^[URFDLB].*2$/.test(raw))
		return { raw, kind: "double", components: [raw] };
	return { raw, kind: "single", components: [raw] };
}

function parseTokens(raw: string) {
	const out: string[] = [];
	let buf = "";
	let depth = 0;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (ch === "(") {
			if (depth === 0 && buf.trim()) {
				out.push(buf.trim());
				buf = "";
			}
			depth++;
			buf += ch;
		} else if (ch === ")") {
			buf += ch;
			depth = Math.max(0, depth - 1);
			if (depth === 0) {
				out.push(buf.trim());
				buf = "";
			}
		} else if (/\s/.test(ch) && depth === 0) {
			if (buf.trim()) {
				out.push(buf.trim());
				buf = "";
			}
		} else buf += ch;
	}
	if (buf.trim()) out.push(buf.trim());
	const moveRegex = /([URFDLBurfdlbMESxyzXYZ][w]?['2]?)/g;
	const expanded: string[] = [];
	const grouped: (string | { group: string; moves: string[] })[] = [];
	for (const tok of out) {
		if (tok.startsWith("(") && tok.endsWith(")")) {
			const inner = tok.slice(1, -1).trim();
			if (inner) {
				let parts: string[] = [];
				if (/\s/.test(inner)) parts = inner.split(/\s+/).filter(Boolean);
				else {
					moveRegex.lastIndex = 0;
					let m: RegExpExecArray | null = moveRegex.exec(inner);
					while (m) {
						parts.push(m[1]);
						m = moveRegex.exec(inner);
					}
				}
				if (!parts.length) parts = [inner];
				expanded.push(...parts);
				grouped.push({ group: tok, moves: parts });
				continue;
			} else grouped.push(tok);
		} else grouped.push(tok);
		if (!(tok.startsWith("(") && tok.endsWith(")"))) expanded.push(tok);
	}
	return { expanded, grouped };
}

function parseSegments(raw: string, expected: number) {
	const segs: SegmentPiece[] = [];
	let buf = "";
	let ti = 0;
	const re = /([URFDLBurfdlbMESxyzXYZ][w]?['2]?)/y;
	for (let i = 0; i < raw.length; ) {
		re.lastIndex = i;
		const m = re.exec(raw);
		if (m) {
			if (buf) {
				segs.push({ text: buf });
				buf = "";
			}
			segs.push({ text: m[1], tokenIndex: ti++ });
			i += m[1].length;
			continue;
		}
		buf += raw[i];
		i++;
	}
	if (buf) segs.push({ text: buf });
	if (ti !== expected) debug("segment mismatch", { ti, expected });
	return segs;
}

function rotationCandidates(): string[] {
	const singles = ["x", "x2", "x'", "y", "y2", "y'", "z", "z2", "z'"];
	const out = [""] as string[];
	out.push(...singles);
	for (const a of singles) for (const b of singles) out.push(`${a} ${b}`);
	for (const a of ["x", "x2", "x'"])
		for (const b of ["y", "y2", "y'"])
			for (const c of ["z", "z2", "z'"]) out.push(`${a} ${b} ${c}`);
	return out;
}

function applyRotationToMove(move: string, t: string): string {
	if (!t) return move;
	const suf = /['2]$/.test(move) ? move.slice(-1) : "";
	const base = suf ? move.slice(0, -1) : move;
	if (!/^[RLFBUDrlfbud]$/.test(base)) return move;
	const mapAxis = (axis: "x" | "y" | "z", f: string): string => {
		const low = f === f.toLowerCase();
		let up = f.toUpperCase();
		if (axis === "x")
			up =
				up === "U"
					? "B"
					: up === "B"
						? "D"
						: up === "D"
							? "F"
							: up === "F"
								? "U"
								: up;
		else if (axis === "y")
			up =
				up === "F"
					? "R"
					: up === "R"
						? "B"
						: up === "B"
							? "L"
							: up === "L"
								? "F"
								: up;
		else if (axis === "z")
			up =
				up === "U"
					? "R"
					: up === "R"
						? "D"
						: up === "D"
							? "L"
							: up === "L"
								? "U"
								: up;
		return low ? up.toLowerCase() : up;
	};
	const tokens = t.split(/\s+/).filter(Boolean);
	let mapped = base;
	for (const tok of tokens) {
		const axis = tok[0] as "x" | "y" | "z";
		const p = tok.endsWith("2") ? 2 : tok.endsWith("'") ? 3 : 1;
		for (let i = 0; i < p; i++) mapped = mapAxis(axis, mapped);
	}
	return mapped + suf;
}

function recomputeDisplay() {
	try {
		if (tracking.badAlg.length) {
			let fix = "";
			for (let i = 0; i < tracking.badAlg.length; i++)
				fix += `${getInverseMove(tracking.badAlg[tracking.badAlg.length - 1 - i])} `;
			const simplified = Alg.fromString(fix)
				.experimentalSimplify({ cancel: true, puzzleLoader: cube3x3x3 })
				.toString()
				.trim();
			setTracking(
				"simplifiedBadAlg",
				simplified ? simplified.split(/\s+/) : [],
			);
			if (tracking.simplifiedBadAlg.length === 0) setTracking("badAlg", []);
		} else setTracking("simplifiedBadAlg", []);
	} catch {
		setTracking("simplifiedBadAlg", [...tracking.badAlg]);
	}
	setTracking("mistakesJustCleared", tracking.badAlg.length === 0);

	const randomAUF = !!algs.options.randomAUF;
	let previousColor = "";
	let previousGroup: string | null = null;
	let isDoubleTurn = false;
	let isOpposite = false;
	let isAuf = false;
	const tokens: TrackingToken[] = [];

	tracking.userAlg.forEach((move, index) => {
		let color = "default";
		const gid = tracking.groupIds[index] || null;
		if (gid !== previousGroup) previousColor = "";

		if (index <= tracking.currentMoveIndex) color = "green";
		else if (
			index <
			1 + tracking.currentMoveIndex + tracking.simplifiedBadAlg.length
		)
			color = "red";
		if (index === tracking.currentMoveIndex + 1 && color !== "red")
			color = "white";

		const clean = move.replace(/[()']/g, "").trim();
		if (index === 0 && tracking.currentMoveIndex === -1 && randomAUF) {
			if (
				tracking.simplifiedBadAlg.length === 1 &&
				/^U/.test(tracking.simplifiedBadAlg[0] || "") &&
				/^U/.test(clean)
			) {
				color = "blue";
				isAuf = true;
			}
		}

		if (index === tracking.currentMoveIndex + 1 && clean.length > 1) {
			const len = tracking.simplifiedBadAlg.length;
			const isSingle = len === 1;
			const isDouble = len === 2;
			const isTriple = len === 3;
			const sliceOrWide = /[MESudlrbfxyz]/.test(
				tracking.userAlg.slice(0, tracking.currentMoveIndex + 1).join(" "),
			);
			if (
				(isSingle && tracking.simplifiedBadAlg[0]?.[0] === clean[0]) ||
				(isSingle && sliceOrWide) ||
				(isDouble && "MES".includes(clean[0])) ||
				(isTriple && "MES".includes(clean[0]))
			) {
				color = "blue";
				isDoubleTurn = true;
			}
		}

		const inverseFirst = getInverseMove(tracking.simplifiedBadAlg[0]);
		const currentClean = tracking.userAlg[index]?.replace(/[()']/g, "");
		if (
			index === tracking.currentMoveIndex + 1 &&
			tracking.simplifiedBadAlg.length === 1
		) {
			const opposite = getOppositeMove(inverseFirst?.replace(/[()'2]/g, ""));
			const nextClean = tracking.userAlg[index + 1]?.replace(/[()']/g, "");
			if (
				(inverseFirst === nextClean ||
					(inverseFirst?.[0] === nextClean?.[0] && nextClean?.[1] === "2")) &&
				(opposite === currentClean ||
					(opposite === currentClean?.[0] && currentClean?.[1] === "2"))
			) {
				color = "white";
				isOpposite = true;
			}
		}
		if (index === tracking.currentMoveIndex + 2 && isOpposite)
			color =
				move.endsWith("2") && inverseFirst !== currentClean ? "blue" : "green";

		if (
			previousColor === "blue" ||
			(previousColor !== "blue" && color !== "blue" && isDoubleTurn)
		) {
			if (["white", "green", "red"].includes(color)) {
				// keep
			} else color = "default";
		}

		let state: TrackingToken["state"] = "future";
		if (color === "green") state = "past";
		else if (color === "white") state = "current";
		else if (color === "red") state = "error";
		else if (color === "blue") state = "partial";

		tokens.push({ move, rendered: move, state, index });
		previousColor = color;
		previousGroup = gid;
	});

	setTracking("isDoubleTurn", isDoubleTurn);
	setTracking("isOpposite", isOpposite);
	setTracking("isAuf", isAuf);
	setTracking("displayTokens", tokens);
}

export function segmentStates() {
	const by = new Map<number, TrackingToken>();
	for (const t of tracking.displayTokens) by.set(t.index, t);
	return tracking.segments.map((seg) =>
		seg.tokenIndex != null
			? { text: seg.text, state: by.get(seg.tokenIndex)?.state }
			: { text: seg.text },
	);
}
