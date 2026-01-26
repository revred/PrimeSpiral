# NextSteps.md — Prime Fibres Exploration Roadmap

## Goal
Move from **“cool visual fibers”** → **measurable, repeatable Prime Fibre discovery**.

We want prime fibres that are:

- **stable across zoom**
- **stable across rendering strategies**
- **stable under small mapping perturbations**
- **statistically above expected prime density**
- **explainable in modular terms (optional but ideal)**

---

## Phase 1 — Confirm we’re not seeing rendering artefacts (1–2 hours)

### ✅ 1. Add a “Stability Test Mode”
**Why:** Some fibres can be created by aliasing, pixel snapping, or warp distortion.

**Add toggles:**
- `Stability Mode: ON/OFF`
- `Test Type:`
  - `SCALE` (change dot radius / pixel size)
  - `PHASE` (rotate mapping by small angle offset)
  - `WARP` (slightly change warp strength)

**What to measure:**
- Does the fibre location (angle) stay the same?
- Does the fibre remain continuous?

**Pass condition (real fibre):**
- Fibre remains visible in **≥ 2 of 3 tests**

---

### ✅ 2. Add “Fixed Render Seed”
**Why:** If anything randomized or adaptive is happening, repeatability breaks.

- Ensure any sampling / chunk ordering is deterministic.
- If you do culling, ensure it does not introduce “temporal streaking”.

---

## Phase 2 — Turn fibres into a real signal (density above expectation) (3–6 hours)

### ✅ 3. Build a Polar Density Grid
Instead of *only drawing primes*, compute a structured density field.

**Divide into bins:**
- Angle bins `θBins`: 720 (or 1440 for higher precision)
- Radius bins `rBins`: 500–2000 (depends on max N)

Each integer point becomes:
- `(r, θ)` based on its spiral location

Each bin accumulates:
- `primeCount`
- `totalCount` (how many points fall into it)
- `expectedPrimeCount ≈ totalCount / ln(nMean)`

---

### ✅ 4. Normalize Fibre Strength
Compute per-bin fibre strength:

**Option A: ratio**
```
score = primeCount / expectedPrimeCount
```

**Option B: z-score (best)**
```
z = (primeCount - expectedPrimeCount) / sqrt(expectedPrimeCount)
```

**Interpretation:**
- `z < 2` → probably noise
- `z = 3 to 5` → strong fibre
- `z > 6` → “this is absolutely not random”

---

### ✅ 5. Render the Fibre Heatmap Overlay
Add a new overlay layer:

- low z-score: invisible
- medium z-score: dim
- high z-score: bright

**Controls:**
- `Heatmap: ON/OFF`
- `Threshold (z): 2 → 8`
- `θBins: 360 / 720 / 1440`
- `rBins: 200 / 500 / 1000`

---

## Phase 3 — Extract and label fibres (6–12 hours)

### ✅ 6. Identify “Top Fibre Angles”
For each angle bin `θ`, sum z-scores across radius bins:

```
angleStrength[θ] = Σ max(0, z(r,θ) - threshold)
```

Pick:
- top 10 / top 20 strongest fibres

**Render them as:**
- “Fibre rails” (thin continuous guide curves)
- with labels like: `F#3 strength=421`

---

### ✅ 7. Fibre Persistence Across Radius
A fibre isn’t real unless it persists.

For each fibre angle candidate:
- check in how many radius bins it is active

```
persistence = activeBins / totalBins
```

**Require:**
- persistence > 0.35 (tune this)

---

### ✅ 8. Fibre Width Estimation (important)
Real fibres have thickness (nearby bins may also be elevated).

Measure the half-width in angle bins:
- how many bins around θ still have high score

This tells whether fibres are:
- razor thin (strong modular alignment)
- or wide bands (visual clustering)

---

## Phase 4 — Modular filters to “clean” fibres (huge visual win) (2–4 hours)

### ✅ 9. Add Prime Congruence Filters
This is a **cheat code** for fibre clarity.

Suggested toggles:
- `p mod 6 = 1`
- `p mod 6 = 5`
- `p mod 30 ∈ {1,7,11,13,17,19,23,29}`
- `p mod 210` residue families

**Expected result:**
- some fibres become dramatically cleaner
- some disappear entirely (meaning they were residue-mixtures)

---

## Phase 5 — Compare against “non-prime” controls (scientific validation) (2–6 hours)

### ✅ 10. Control Groups
We need to prove fibres are not just from geometry.

Add overlays for:
- composites only
- numbers divisible by 3
- numbers divisible by 5
- numbers divisible by 7

**Goal:**
- primes show unique fibre behaviour compared to divisor groups

---

### ✅ 11. Random “Prime-Like” Simulation
Make a synthetic set:
- randomly mark numbers “prime” with probability `1/ln(n)`

Render this fake-prime field.

**If fake primes show similar fibres → geometry artefact.**  
**If real primes show much stronger fibres → real structure.**

---

## Phase 6 — Experimental “fibre search” engine (12–24 hours)

### ✅ 12. Automated Fibre Discovery Runner
Instead of you hunting visually, run sweeps.

Add `Run Discovery` mode that loops:

- multiple maxN values
- multiple warp strengths
- multiple θBins
- multiple spiral constants (optional)

Outputs:
- best fibre angles
- persistence
- confidence score

Export:
- `fibres.json`
- `fibres.csv`

---

### ✅ 13. Fibre Library + Replay
Store the best fibre sets as named presets:

- `FIBRES_N_200K`
- `FIBRES_N_2M`
- `FIBRES_WARP_120`

So you can compare across time.

---

## Phase 7 — “Prime Fibre Hypothesis Testing” (optional, high-value)

### ✅ 14. Hypothesis: Fibres correlate with quadratic forms
Classic prime patterns appear in forms like:
- `n^2 + n + 41`
- `n^2 - n + 41`
- `n^2 + 1`

Add toggles for:
- `Euler fibre overlay`
- `Legendre-type overlay`
- any quadratic family overlay

Then test:
- do those curves coincide with high-density fibres?

---

## Phase 8 — Performance requirements (do not compromise)

### ✅ 15. Keep it real-time
Targets:
- 60fps ideal
- 20fps acceptable at 2M points
- >10fps is “still usable”

Don’t regress performance.

Must-haves:
- chunked computation
- async worker for binning
- incremental heatmap updates

---

## Most Important Deliverable (the “big unlock”)
If we implement only **one thing next**, do this:

✅ **Polar fibre heatmap with z-score normalization + top fibre extraction**

That transforms the project from:
> “interesting spiral visualization”
into
> “prime fibre detector”

---

## Suggested File Additions
Recommended structure:

```
/src/
  spiral/
    mapping.js
    warp.js
  fibres/
    fibreBins.js
    fibreHeatmap.js
    fibreExtract.js
    fibreExport.js
  ui/
    fibreControls.js
```

---

## Success Criteria (black & white)
We win when:

✅ Fibres are detected **numerically** (not just visually)  
✅ Fibre angles repeat across maxN scales  
✅ Fibre strength grows with N (signal dominates noise)  
✅ Control groups do NOT show the same fibres  
✅ Modular filters sharpen fibres further  

---

## Immediate Next Action (do this now)
1) Implement polar binning (`θBins x rBins`)  
2) Compute expected prime density and z-score  
3) Draw heatmap overlay  
4) Extract top 20 fibres  
5) Add “stability test mode”
