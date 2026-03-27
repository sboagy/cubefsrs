# Plan: Cube Visualization, Mapping & Algorithm Tracking Refactor

**Issue:** [#6 — Error detection for bad turns often fails](https://github.com/sboagy/cubefsrs/issues/6)
**Branch:** `cf-cube-refactor`
**Status:** In planning

---

## 0. Purpose of This Document

Issue #6 contains an abstract plan for a "Fixed-Grip Translation Layer" to support
Yellow-Up drilling. This document maps that abstract plan to the **actual codebase**,
identifies bugs and gaps, and proposes concrete, ordered steps to reach a working
state. Clarifying questions were answered by the owner and are recorded in [§7](#7-clarifying-questions-and-answers).

---

## 1. Current State Assessment

Most of the infrastructure described in the issue is **already implemented**. The
table below shows what exists, so no one inadvertently recreates it.

| Component | File | Status |
|---|---|---|
| z2 move-translation map (`mapTokenByZ2`) | `src/lib/orientationMap.ts` | ✅ Complete, unit-tested |
| Orientation mode signal + localStorage persistence | `src/stores/orientation.ts` | ✅ Complete |
| Orientation UI toggle (Yellow-Up / White-Up) | `src/views/OptionsView.tsx` | ✅ Complete |
| Visual z2 flip for TwistyPlayer (`experimentalSetupAlg`) | `src/components/practice/CubeViewer.tsx` | ✅ Complete |
| z2 applied to `experimentalAddMove` for live hardware | `src/components/practice/CubeViewer.tsx` | ✅ Complete |
| z2 translation inside `ingestMove` (tracking) | `src/stores/tracking.ts` | ✅ Exists — **but has a double-application bug (§2)** |
| Rotation-candidate calibration inside `ingestMove` | `src/stores/tracking.ts` | ✅ Exists — needs verification after §2 fix |
| `ingestMove` orientation parameter (replaces `window._orientationMode`) | `src/stores/tracking.ts` | ❌ Not yet — to be added (§2-refactor) |
| Rotation auto-advance for mid-algorithm `x`/`y`/`z` tokens | `src/stores/tracking.ts` | ❌ Not yet (§3) |
| AUF prefix wired to `CubeViewer` and `setAlgorithm` | `src/views/PracticeView.tsx` | ❌ Incomplete (§5) |
| Unit tests: `mapTokenByZ2` | `tests/lib/orientationMap.test.ts` | ✅ Complete |
| Unit tests: `ingestMove` / tracking store | (none) | ❌ Missing |

---

## 2. Root Bug: Double-Translation in the Move Pipeline

### 2.1 Diagnosis

The primary bug causing error detection to fail for Yellow-Up is a **double application
of the z2 orientation map** before any move is evaluated against the algorithm.

**Pipeline for a physical Yellow-Up turn (e.g., physical top-face CW → hardware reports `D`):**

```
Hardware emits "D"
  │
  ▼
device store: lastMove = "D", lastMoveAt = <timestamp>
  │
  ├─► CubeViewer.tsx effect:
  │     raw "D" → mapTokenByZ2("D") = "U"
  │     TwistyPlayer.experimentalAddMove("U")      ← correct: visual shows U turn
  │
  └─► PracticeView.tsx effect:                      ← BUG STARTS HERE
        logical = mapTokenByZ2("D") = "U"
        ingestMove("U")
          │
          └─ inside ingestMove (tracking.ts):
               reads window._orientationMode = "yellow-up"
               logical = mapTokenByZ2("U") = "D"  ← second application cancels first!
               compare "D" against algorithm's expected "U" → MISMATCH → false error
```

Since `mapTokenByZ2` is its own inverse (z2 ∘ z2 = identity for all face moves),
applying it twice cancels out. The tracking logic effectively receives the raw hardware
move, not the logical yellow-up move — so it can never match an OLL/PLL algorithm
written in standard white-up notation.

### 2.2 Fix — Part A: Remove pre-translation; Part B: Replace global with explicit parameter

These two changes are done together since they touch the same call site.

**Part A — Remove the pre-translation in `PracticeView.tsx`.** Pass the raw device
move to `ingestMove`. The tracking store should receive the raw hardware move and
translate it once internally.

**Part B — Replace `window._orientationMode` global bridge.** Rather than routing
orientation state through a mutable `window` global, add an explicit `orientation`
parameter to `ingestMove`. `PracticeView` passes the reactive `orientationMode()`
value. This eliminates the code smell while also making the fix cleaner.

**File:** `src/stores/tracking.ts`

```diff
-export function ingestMove(deviceMove: string) {
+export function ingestMove(deviceMove: string, orientation: import("@/stores/orientation").OrientationMode = "white-up") {
   ...
-  const orientationMode = window._orientationMode || "white-up";
-  if (orientationMode === "yellow-up") logical = mapTokenByZ2(logical);
+  if (orientation === "yellow-up") logical = mapTokenByZ2(logical);
   ...
 }
```

All occurrences of `window._orientationMode` inside `tracking.ts` are replaced by
the local `orientation` parameter. The `declare global { interface Window { _orientationMode? } }`
declaration and the write in `src/stores/orientation.ts` can both be removed once
no other call site uses the global.

**File:** `src/views/PracticeView.tsx`

```diff
 createEffect(() => {
     const moveAt = device.lastMoveAt;
     const mv = untrack(() => device.lastMove);
     if (moveAt == null) return;
     if (!mv) return;
     untrack(() => {
-        const logical =
-            orientationMode() === "yellow-up" ? mapTokenByZ2(mv.trim()) : mv.trim();
-        ingestMove(logical);
+        // Pass the raw device move and orientation. tracking.ts applies the
+        // z2 map internally so it is not applied twice (z2 ∘ z2 = identity = bug).
+        ingestMove(mv.trim(), orientationMode());
     });
 });
```

After this change, the `mapTokenByZ2` import can be removed from `PracticeView.tsx`
(but `orientationMode` is still used — keep that import).

### 2.3 Verification

After the fix, the expected pipeline becomes:

```
Hardware emits "D"
  │
  ├─► CubeViewer: mapTokenByZ2("D") = "U" → TwistyPlayer.experimentalAddMove("U")  ✅
  └─► PracticeView: ingestMove("D", "yellow-up")
        └─ tracking.ts: mapTokenByZ2("D") = "U", compare "U" vs expected "U"       ✅
```

### 2.4 `_didEarlyCalibration` reset

The module-level `_didEarlyCalibration` flag is never reset after the first algorithm
loads in a session. This means if a user changes their grip orientation or physically
moves the cube between algorithms, the calibration phase is skipped for all subsequent
algorithms. **Decision (Q3 answer):** reset it in `setAlgorithm`.

```diff
 export function setAlgorithm(raw: string) {
   ...
+  _didEarlyCalibration = false;
   ...
 }
```

---

## 3. Rotation Tokens in Algorithms

### 3.1 Problem Description

Some OLL/PLL algorithms include whole-cube rotation tokens (`x`, `y`, `z`). For
example: `R U R' y R' U R U' R'`. When the user physically rotates the cube mid-solve,
most GAN Bluetooth cubes (without gyroscopes) **do not emit a rotation event**. The
hardware only reports face moves. As a result:

- The kpuzzle-based pattern state correctly advances through the rotation in its
  internal representation.
- The user's next physical face move is relative to the new physical orientation, but
  the device still reports it in the original hardware face encoding.
- Unless the `eventTransform` auto-calibration detects the orientation change, the move
  will be flagged as an error.

### 3.2 Existing Mitigation

`ingestMove` already has a multi-pass rotation-candidate loop (`rotationCandidates()`)
that tries every combination of x/y/z rotations to find one that makes the move match.
This fires:
- On the first move (`_didEarlyCalibration` guard)
- After a miss when `eventTransform` is not yet set
- As a "rotation refinement" when `eventTransform` is set and the algorithm advances

This mechanism **may correctly handle most mid-algorithm rotations** if the calibration
fires at the right time. The question is whether it reliably fires on the move
immediately following a rotation token.

### 3.3 Implementation: Auto-Skip Rotation Tokens (Option A — confirmed)

**Decision (Q1 answer):** Implement Option A. Critical OLL/PLL algorithms do contain
mid-algorithm rotation tokens and the auto-skip approach is the correct solution.

Add a helper `advancePastRotations()` that silently advances `currentMoveIndex` past
any rotation token (`x`, `y`, `z`, with any suffix) that would otherwise wait for a
hardware event that never comes. The physical rotation the user performs after the
token changes their hardware→logical face mapping, which is already detected by the
existing `eventTransform` calibration on the next face move.

```typescript
// In tracking.ts — call after each successful move acceptance and in setAlgorithm
function advancePastRotations() {
  while (true) {
    const next = tracking.userAlg[tracking.currentMoveIndex + 1];
    if (!next) break;
    const clean = next.replace(/[()]/g, "");
    if (!/^[xyz](?:[2'])?$/i.test(clean)) break;
    // It's a rotation token — advance without hardware input.
    // _progressPatternRaw has already been computed for this index during initPatterns.
    const nextIndex = tracking.currentMoveIndex + 1;
    _progressPatternRaw = _patternStates[nextIndex] ?? _progressPatternRaw;
    setTracking("currentMoveIndex", nextIndex);
    // Reset early calibration so the next face move re-probes orientation.
    _didEarlyCalibration = false;
  }
}
```

`advancePastRotations()` is called:
1. At the end of every successful single/slice/wide/double acceptance block in `ingestMove`
2. In `setAlgorithm` after `recomputeDisplay()` (in case the algorithm starts with a rotation token)
3. In `forceReady()` and `ensureImmediateReady()` after pattern init completes

**Note on `_didEarlyCalibration`:** Resetting it inside `advancePastRotations()` is
intentional — after the user physically rotates the cube, the next face move will
have a different hardware→logical mapping and the calibration probe needs to re-run.

---

## 4. Required Test Coverage

### 4.1 `tests/stores/tracking.test.ts` — New File

The tracking store has the most complex logic in the codebase and has **zero unit
tests**. This is the highest-risk gap. The following test scenarios should be covered:

| Scenario | What to verify |
|---|---|
| **Happy path — single move** | `ingestMove("R")` with alg `"R U R'"` → `currentMoveIndex` becomes 0 |
| **Happy path — full sequence** | Step through all moves of a short alg → all tokens green, `currentMoveIndex` reaches end |
| **Yellow-up: D → U acceptance** | `ingestMove("D", "yellow-up")` on alg `"U ..."` → accepted |
| **Yellow-up: no double-cancel** | `ingestMove("D", "yellow-up")` (raw move, correct orientation) accepts as `"U"`; `ingestMove("U", "yellow-up")` on same alg → rejected (proves no double-cancel) |
| **Wrong move → error** | `ingestMove("L")` when next expected is `"R"` → `badAlg` non-empty |
| **Undo (inverse)** | After wrong `"L"`, send `"L'"` → `badAlg` clears |
| **Slice composite (M)** | Two-part M slice via `"R"` + `"L'"` sequence → advance to next token |
| **Double turn (U2 = U + U)** | Two consecutive `"U"` quarter turns → advance past `"U2"` token |
| **Rotation token — auto-advance** | Alg `"R y R'"` → after `"R"` accepted, rotation auto-advances, `"R"` (from new POV) accepted next |
| **`setAlgorithm` resets state** | After partial progress, `setAlgorithm(newAlg)` → `currentMoveIndex = -1`, `badAlg = []` |
| **`resetTracking` resets state** | Mid-alg `resetTracking()` → `currentMoveIndex = -1`, `badAlg = []` |

Mock requirements for `tracking.test.ts` (follow the pattern in `fsrs.test.ts`):

```typescript
vi.mock("cubing/alg", () => ({ Alg: { fromString: () => ({ invert: () => ({toString: () => ""}) }) } }));
vi.mock("cubing/puzzles", () => ({ cube3x3x3: { kpuzzle: () => Promise.resolve({ defaultPattern: () => new SeqPatternStub() }) } }));
vi.mock("@/stores/algs", () => ({ algs: { options: { randomAUF: false } } }));
```

The `SeqPattern` class (already in `tracking.ts` as a module-level class) can be used
as the pattern stub for tests since it is already exported-compatible.

**Note on `_didEarlyCalibration`:** This module variable is a shared mutable singleton.
Because `setAlgorithm` will now reset it (§2.4), tests simply call `setAlgorithm`
before each scenario to get a clean slate. No separate reset export is needed.

### 4.2 `tests/lib/orientationMap.test.ts` — Already Exists

Current coverage is comprehensive. No additions needed for this refactor unless new
orientation modes are added (see [Q2](#q2-additional-orientation-modes)).

---

## 5. AUF Prefix Wiring

### 5.1 Current State

The `_auf` signal in `PracticeView.tsx` is populated with a random AUF string (`""`,
`"U"`, `"U2"`, or `"U'"`) when the user clicks Train with `randomAUF` enabled, but
it is **never applied**: `CubeViewer` receives `baseAlg()` and `setAlgorithm` is called
with `baseAlg()`, so the AUF is a no-op.

### 5.2 Fix

Introduce an `aufAlg()` derived memo that prepends the AUF prefix to `baseAlg()` when
`randomAUF` is enabled and `_auf()` is non-empty. Use `aufAlg()` everywhere the
algorithm is shown or tracked.

```typescript
// In PracticeView.tsx — replace the baseAlg usages for tracking/viewer
const aufAlg = createMemo(() => {
  const auf = _auf();
  const base = baseAlg();
  if (!auf || !algs.options.randomAUF) return base;
  return `${auf} ${base}`.trim();
});
```

Changes:
1. `CubeViewer alg={aufAlg()}` (was `baseAlg()`)
2. In the `setAlgorithm` effect, track `aufAlg()` instead of `baseAlg()` and compare
   against `tracking.rawAlg` accordingly.
3. The `trainNonce` bump on Train should still force a visual reset even when the AUF
   string does not change between clicks (same nonce logic as before).

### 5.3 Orientation Interaction

The AUF string (`U`, `U2`, `U'`) is written in **logical (standard) notation**.
In Yellow-Up mode the user physically performs a top-face turn; the hardware reports
`D`; `ingestMove` translates `D` → `U` before comparing against the AUF `U`. No
special orientation treatment of the AUF string is required.

### 5.4 Required Test Scenario

Add to `tracking.test.ts`:

| Scenario | What to verify |
|---|---|
| **AUF prefix tracked** | `setAlgorithm("U R U R'")` → `ingestMove("U", "white-up")` advances past the AUF `U` |
| **AUF prefix tracked — yellow-up** | `setAlgorithm("U R U R'")` → `ingestMove("D", "yellow-up")` advances past the AUF `U` |

---

## 6. Scope Boundary: What NOT to Change

The following items are **out of scope** for this refactor:

| Item | Rationale |
|---|---|
| `CaseThumb.tsx` orientation | Thumbnails in the library view intentionally show the standard algorithm representation (white-up). They do not receive live device moves. |
| FSRS scheduling logic | No changes needed for this issue. |
| Supabase / oosync sync layer | No changes needed for this issue. |
| `experimentalSetupAlg` in `CubeViewer.tsx` | The `z2` setup for the visual flip is correct and complete. |
| Color-neutral orientation mode | Explicitly future work (Q2 answer). |

---

## 7. Implementation Order

### Step 1 — Fix double-translation + replace `window._orientationMode` _(Priority: Critical)_
- Edit `src/stores/tracking.ts`: add `orientation` parameter to `ingestMove`, remove
  all reads of `window._orientationMode` and the `declare global` block.
- Edit `src/views/PracticeView.tsx`: remove the pre-translation logic; pass `orientationMode()`
  as the second argument to `ingestMove`; remove the now-unused `mapTokenByZ2` import.
- Edit `src/stores/orientation.ts`: remove the `window._orientationMode = ...` write
  if no other consumer remains.
- Manual smoke-test: Yellow-Up selected, perform a physical top-face-clockwise turn;
  verify TwistyPlayer shows a `U` turn and tracking advances.

### Step 2 — Reset `_didEarlyCalibration` in `setAlgorithm` _(Priority: High)_
- Edit `src/stores/tracking.ts` per §2.4.
- One-line change.

### Step 3 — Implement rotation auto-advance _(Priority: High)_
- Add `advancePastRotations()` to `tracking.ts` per §3.3.
- Call it from every successful acceptance branch in `ingestMove`, from `setAlgorithm`,
  from `forceReady`, and from `ensureImmediateReady`.

### Step 4 — Implement AUF prefix wiring _(Priority: Medium)_
- Add `aufAlg()` memo to `PracticeView.tsx` per §5.2.
- Pass `aufAlg()` to `CubeViewer` and use it in the `setAlgorithm` effect.

### Step 5 — Add tracking store unit tests _(Priority: High — write alongside Steps 1–4)_
- Create `tests/stores/tracking.test.ts` covering the scenarios in §4.1 and §5.4.
- The Yellow-Up regression test guards against reintroducing the double-translation bug.

### Step 6 — Run full test suite and typecheck _(Priority: Required before merge)_

```bash
npm run typecheck
npm run lint
npm run test
```

All must pass with zero new errors.

---

## 8. Clarifying Questions and Answers

### Q1: Rotation auto-skip

When an algorithm contains a whole-cube rotation token (`x`, `y`, `z`) and the user is
drilling without a gyroscope-equipped cube, what should happen?

**Option A — Auto-skip:** The app silently advances past the rotation token. The user
physically rotates the cube and the next face move is evaluated relative to the new
orientation (via the existing `eventTransform` calibration).

**Option B — Require physical rotation + calibration:** The app does not auto-advance.
The user must physically rotate, and the `eventTransform` mechanism detects the change
from the discrepancy between the next expected move and what the hardware reports. This
is the current implicit behavior.

**Option C — Ignore rotations in algorithms entirely:** Algorithms that include rotation
tokens are re-written or flagged to avoid them, so the question is moot in practice.

**Preference / use cases to consider:** Which algorithm categories currently in use
contain rotation tokens? Do any critical OLL/PLL cases require mid-algorithm rotations?

> **Answer:**

> Do any critical OLL/PLL cases require mid-algorithm rotations?

Yes.

I think do your best with Option A.

---

### Q2: Additional orientation modes

The abstract plan mentions `CubeOrientation = 'white-up' | 'yellow-up'` but also notes
it can "expand to color-neutral later." Is color-neutral drilling within scope for this
iteration or strictly future work?

> **Answer:**

Strictly future work.  I will be happy if both white-up and yellow-up work correctly, at least for now.

---

### Q3: `_didEarlyCalibration` singleton

The module-level `_didEarlyCalibration` flag in `tracking.ts` is reset to `false` only
on module load. In practice, once calibration fires on the first algorithm, it never
re-runs for subsequent algorithms in the same session, even if the user changes their
grip. Is this intentional? Should it reset when `setAlgorithm` is called?

> **Answer:**

I don't really know the answer for this.  I assume the reset when `setAlgorithm` is called is correct.  But just do the right thing. 

---

### Q4: Default orientation

`src/stores/orientation.ts` defaults to `"yellow-up"` when no preference is stored:

```typescript
const stored = safeGet<OrientationMode>("cubefsrs.orientationMode", "yellow-up");
```

Is this intentional for new users? Or should the default be `"white-up"` (the WCA
standard)?

> **Answer:**

I think keep the default as yellow-up.  I might change my mind at some point, I guess.  But I think white-up 
is just stupid.

---

### Q5: Handling algorithms with AUF (pre-move U turns)

The practice view has a `randomAUF` option. When AUF is enabled, a random `U` move
prefix is added. In Yellow-Up mode, `U` maps to `D`. Is the AUF logic already
orientation-aware, or does it also need to be patched?

Looking at `PracticeView.tsx`: the `_auf` signal stores the AUF string but I did not
find where it is applied to the tracking algorithm or to `CubeViewer`. This may be a
separate incomplete feature.

> **Answer:**

I'm pretty sure it's an incomplete feature.  See if you can make it work correctly?

---

## 9. Deferred Items (Future Issues)

These were observed during the codebase review. They are explicitly out of scope for
this refactor:

- **`CaseThumb.tsx` does not react to `orientationMode`** — Thumbnails in the library
  always show white-up. For Yellow-Up users this means the thumbnail shows the solved
  state from white-up perspective. Low impact since the main practice viewer is correct.

- **Color-neutral orientation mode** — The type `OrientationMode = 'white-up' | 'yellow-up'`
  is designed to expand, but color-neutral support is strictly future work (Q2 answer).
