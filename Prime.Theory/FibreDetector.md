# FibreDetector.md — Prime Fibre Detection (Highest Priority + Tooling)

## Mission (1 line)
Turn the Prime Spiral from a renderer into a **measurable Prime Fibre Detector**.

A **Prime Fibre** is **not** a pretty curve.  
It is a **statistically significant and persistent prime-density ridge** in the spiral field.

---

# 1) Highest Priority Outcomes (Black & White)

## ✅ Priority 0 — Prevent self-deception (Artefact Control)
**Non-negotiable:** if we don’t do this, everything else can be fake.

**Pass criteria:**
- Fibres remain under small perturbations (scale / warp / phase).
- Fibres differ from random prime simulations.

**If not true → fibre is not real.**

---

## ✅ Priority 1 — Build Fibre Signal Field (Heatmap)
This is the **big unlock**.

Instead of plotting primes, compute a **density grid** and score it vs expected prime density.

**Pass criteria:**
- Heatmap shows stable “ridges” that persist across radius.
- Those ridges show **z-score > 3** in significant regions.

---

## ✅ Priority 2 — Extract Fibres Automatically (Top-K)
Once the heatmap exists, the detector must:

- identify the strongest fibre angles (or bands)
- rank them
- track persistence
- export them

**Pass criteria:**
- “Top 20 fibres” list is stable across increasing \(N\).
- Same fibres appear after small warp changes.

---

## ✅ Priority 3 — Fibre Oracle (Click → Fit → Predict)
Only after the above foundation is real, add interactive discovery.

**Pass criteria:**
- Clicking primes produces a fibre candidate that scores above baseline.
- Predictions are validated statistically (not visual-only).

---

# 2) Core Definitions (so we don’t drift)

## 2.1 Expected Prime Density
Near integer \(n\):

\[
P(n\text{ is prime}) \approx \frac{1}{\ln(n)}
\]

This is the baseline expectation.

---

## 2.2 Polar Binning Grid
We discretize the spiral field into bins:

- `θBins` = 720 or 1440  
- `rBins` = 500–2000

Each bin stores:
- `primeCount`
- `totalCount`
- `expectedPrimeCount`

---

## 2.3 Fibre Strength (Z-Score)
Per bin:

\[
z = \frac{\text{primeCount} - E}{\sqrt{E}}
\]

Interpretation:
- `z < 2` → noise
- `z 3–5` → strong candidate
- `z > 6` → extremely significant

---

# 3) The Minimal Detector Pipeline (Do this in order)

## Step A — Polar Binner (foundation)
**Deliverable:** fast integer → bin index mapping.

### Inputs
- integer `n`
- point `(x,y)` or `(ρ,θ)`
- `θBins`, `rBins`

### Output
- bin index `(ri, ti)`
- update:
  - totalCount++
  - primeCount++ if prime

---

## Step B — Expected Prime Model
**Deliverable:** expected primes per bin.

For each bin:
- estimate `nMean` in that bin (approx is fine)
- compute:
  - `E = totalCount / ln(nMean)`
- store `E`

---

## Step C — Heatmap Renderer (signal visualization)
**Deliverable:** overlay showing fibre ridges.

Render based on:
- `z-score threshold` slider  
- visible bins only

---

## Step D — Fibre Extraction (Top-K rails)
**Deliverable:** “Top Fibres list” from heatmap.

For each angle bin `t`:

\[
Strength(t)=\sum_{r} \max(0, z(r,t)-z_{min})
\]

Then:
- sort
- take top `K = 10/20`

---

## Step E — Fibre Persistence Filter (kills noise)
A fibre must persist across radius bands.

\[
Persistence = \frac{\#\text{bins with } z>z_{min}}{\text{total radius bins}}
\]

Require:
- `persistence >= 0.35` (tune later)

---

## Step F — Export + Replay
**Deliverable:** reproducibility.

Export:
- `fibres.json`
- `fibres.csv`

So results can be compared across:
- maxN changes
- warp changes
- different machines

---

# 4) Tooling Required (What to build to achieve priorities)

## Tool 1 — Stability Test Mode (Priority 0)
A mode that re-renders under perturbations:

### Tests
1) **SCALE test**
- dot radius 1px ↔ 2px ↔ 3px
- fibre list should remain similar

2) **PHASE test**
- apply small phase offset:
  - `θ := θ + δ`
- fibres should shift consistently or remain

3) **WARP test**
- slightly adjust warp:
  - `ρ=f(n)` vs `ρ=f(n)^(1.01)`
- fibres should not disappear

### Output
A “Stability Score” per fibre:
- how many tests it survives (0–3)

---

## Tool 2 — Fake Prime Simulator (Priority 0)
Generate control “prime-like” field:

Mark `n` prime with probability:
\[
p = 1/\ln(n)
\]

Overlay fake primes heatmap.

**Expected outcome:**
- fake primes should NOT show strong persistent ridges like real primes  
(or if they do → your fibres are geometry artefacts)

---

## Tool 3 — Congruence Filters (Sharpening Tool)
Filters reduce residue mixing and can “clean” fibres:

- `p mod 6 = 1`
- `p mod 6 = 5`
- `p mod 30` allowed set
- `p mod 210` families

This is not proof, but a huge clarity tool.

---

## Tool 4 — Fibre Inspector Panel (Must-have UI)
When user clicks a fibre:

Show:
- angle bin index
- strength score
- persistence score
- z-score distribution across r
- where it’s strongest

This makes fibres debuggable.

---

## Tool 5 — Oracle (Priority 3, after foundation)
Interactive fibre hypothesis solver:

### Input
User selects 2–4 primes

### Output
- fitted family (quadratic or “rail”)
- predicted next zones
- score of fit vs baseline

**Important:** Oracle output must be validated via z-score/persistence, not intuition.

---

# 5) Recommended Module Layout
Suggested structure:

```
/src/
  fibres/
    fibreBins.js        // polar binning + accumulation
    fibreExpected.js    // expected prime count model
    fibreZScore.js      // scoring map
    fibreHeatmap.js     // overlay renderer
    fibreExtract.js     // Top-K fibres + persistence
    fibreStability.js   // stability tests
    fibreControlSim.js  // fake primes
    fibreExport.js      // json/csv export
  ui/
    fibreControls.js    // sliders + toggles
    fibreInspector.js   // panel for fibre info
```

---

# 6) Minimum UI Toggles (Don’t bloat)
Keep the UI tight but powerful:

- Heatmap: ON/OFF  
- z-threshold: 2 → 8  
- θBins: 360 / 720 / 1440  
- rBins: 200 / 500 / 1000  
- Top fibres: 10 / 20 / 50  
- Stability mode: ON/OFF  
- Fake primes: ON/OFF  
- Congruence filter: OFF / mod6 / mod30 / mod210  

---

# 7) “Stellar” Success Criteria (Final Proof)
A fibre is real if:

✅ It appears in real primes heatmap with `z > 4` in many radius bands  
✅ It survives at least **2/3 stability tests**  
✅ It does **not** appear (or is far weaker) in fake-prime control  
✅ Its Top-K rank stays stable as maxN increases  

---

# 8) What to Build First (Highest Priority Build Order)

### 🚀 Build Order (do not reorder)
1) **Polar Binning + z-score map**  
2) **Heatmap overlay**  
3) **Top-K fibre extraction + persistence**  
4) **Fake prime control overlay**  
5) **Stability test mode**  
6) **Export + replay**  
7) Oracle + predictive fibres

If you do only one thing this week:
✅ **Heatmap + z-score + Top-K extraction**
