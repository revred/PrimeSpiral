# FibreTheoryV2 — Appendix A
**Implementation-Exact Definitions (Data Structures, Scoring, and Acceptance Tests)**

This appendix removes ambiguity so FibreTheoryV2 plugs directly into:
- **NextSteps.md** (build order)
- **FibreDetector.md** (priorities + tooling)

---

## A1) Canonical Mapping and What the Detector Consumes

### Inputs (per integer)
For each integer \(n\ge 1\), the renderer already computes a point:
- \(x = P(n)\)
- \(y = Q(n)\)

The detector requires, additionally, the **polar form**:
- \(\rho = \sqrt{x^2+y^2}\)
- \(\theta = \operatorname{atan2}(y,x)\) mapped into \([0,2\pi)\)

> Implementation note: do **not** recompute \(x,y\) if you already have them; compute \(\rho,\theta\) once per point.

### Warp Function (lens)
You may render with \(\rho=f(n)\) and \(\theta=\omega n + \theta_0\).
The detector stays correct as long as:
- \(f\) is strictly increasing
- \(\theta_0\) is configurable for phase tests

---

## A2) Polar Binning Grid

### Parameters
- `thetaBins` (typical: 720 or 1440)
- `radiusBins` (typical: 500–2000)
- `rhoMax` = max \(\rho\) visible (or computed for the current N range)

### Bin index mapping
Let:
- \(t \in [0,2\pi)\)
- \(r \in [0,\rho_{max}]\)

Then:
\[
t_i = \left\lfloor \frac{\theta}{2\pi}\cdot \thetaBins \right\rfloor
\]
\[
r_i = \left\lfloor \frac{\rho}{\rho_{max}}\cdot \text{radiusBins} \right\rfloor
\]

Clamp:
- `ti = min(max(ti,0), thetaBins-1)`
- `ri = min(max(ri,0), radiusBins-1)`

### Flattened index
\[
idx = r_i\cdot \thetaBins + t_i
\]

---

## A3) Required Per-Bin Accumulators

### Core bin structure
```ts
type Bin = {
  totalCount: number;         // # of integers landing in this bin
  primeCount: number;         // # of primes landing in this bin (chi(n)=1)
  nSum: number;               // sum of n for points in this bin (to estimate nMean)
  nCount: number;             // count of n contributions (usually = totalCount)
  expectedPrimeCount: number; // computed later
  z: number;                  // computed later
};
```

### Update rule (streaming)
For each integer `n` rendered/considered:
- compute `(ti,ri,idx)`
- `bins[idx].totalCount += 1`
- `bins[idx].nSum += n`
- `bins[idx].nCount += 1`
- if `isPrime(n)` then `bins[idx].primeCount += 1`

---

## A4) Expected Prime Model (Baseline)

### Prime Number Theorem baseline
\[
\mathbb{P}(n\text{ is prime}) \approx \frac{1}{\ln(n)}
\]

### Per-bin expected prime count
Let:
\[
n_{mean} = \frac{nSum}{\max(1,nCount)}
\]
Then:
\[
E = \frac{\text{totalCount}}{\ln(\max(n_{mean}, 3))}
\]

Implementation notes:
- Use `max(nMean, 3)` to avoid \(\ln(1)\) / \(\ln(2)\) issues.
- For bins with very small `totalCount`, `E` will be tiny—handled naturally by z-score thresholds.

---

## A5) Fibre Signal (Z-score)

### Per-bin z-score
\[
z = \frac{\text{primeCount} - E}{\sqrt{\max(E,\epsilon)}}
\]
Recommended: `epsilon = 1e-9`.

Interpretation:
- `z < 2`: noise
- `z 3–5`: meaningful fibre ridge candidate
- `z > 6`: extremely significant (under baseline model)

---

## A6) Angle Strength (Fibre Extraction)

### Strength per angle bin
Given a threshold `zMin` (typical: 2.5–4.0):

\[
Strength(t_i)=\sum_{r_i=0}^{radiusBins-1} \max\left(0, z(r_i,t_i)-z_{min}\right)
\]

### Persistence per angle bin
\[
Persistence(t_i)=\frac{\#\{r_i : z(r_i,t_i)\ge z_{min}\}}{radiusBins}
\]

### Fibre width (optional but recommended)
For each selected peak `ti`, estimate angular half-width:
- Expand left/right while `Strength(t)` stays above a fraction (e.g., 50%) of the peak.
- Record:
  - `tiLeft`, `tiRight`, `widthBins = tiRight-tiLeft+1`

---

## A7) Fibre Object (What gets exported and replayed)

```ts
type Fibre = {
  thetaBin: number;      // peak bin (center)
  strength: number;      // Σ positive excess above zMin across radius
  persistence: number;   // fraction of radius bins active above zMin
  widthBins?: number;    // optional angular width
  thetaRad: number;      // center angle in radians (derived)
  stability?: {          // filled by stability tooling
    scalePass: boolean;
    phasePass: boolean;
    warpPass: boolean;
    passCount: number;   // 0..3
  };
};
```

### Angle conversion
\[
\theta_{rad} = 2\pi\cdot\frac{thetaBin + 0.5}{thetaBins}
\]

---

## A8) Acceptance Rules (Black & White)

A detected fibre is **accepted** only if all conditions hold:

### 1) Signal
- `strength >= Smin` (project-defined, tune after observing)
- `persistence >= Pmin` (start with 0.35)

### 2) Stability (must pass ≥ 2/3)
Stability tests produce 3 fibre lists (or 3 strength maps) under:
- **SCALE**: dot size / pixel radius changes
- **PHASE**: small \(\theta_0\) offset (e.g., ±0.5° or ±1°)
- **WARP**: small warp adjustment (e.g., \(f(n)\) exponent ±1%)

A fibre passes a test if:
- a fibre exists within ±`deltaThetaBins` (e.g., 2–4 bins) of the baseline `thetaBin`
- and its strength is not catastrophically lower (e.g., ≥ 60% of baseline)

Accept if:
- `passCount >= 2`

### 3) Control rejection (must differ from controls)
Compute the same fibre extraction for:
- fake-prime simulation field
- divisor control overlays (multiples of 3/5/7 or composites)

Reject if:
- the same `thetaBin` (within tolerance) appears with comparable strength/persistence in controls

---

## A9) Fake Prime Simulation (Control Field)

Define:
\[
\tilde\chi(n) \sim \text{Bernoulli}\left(\frac{1}{\ln(\max(n,3))}\right)
\]

Use \(\tilde\chi(n)\) in place of `isPrime(n)` and run the identical binning + extraction.

**Rule:** Real fibres must beat fake fibres significantly (strength/persistence).

---

## A10) Outputs (Files and Schema)

### fibres.json (recommended)
```json
{
  "thetaBins": 1440,
  "radiusBins": 1000,
  "zMin": 3.5,
  "rhoMax": 12345.67,
  "maxN": 2000000,
  "warp": {"type":"power","alpha":0.45},
  "phase": {"theta0": 0.0},
  "fibres": [
    {
      "thetaBin": 812,
      "thetaRad": 3.544,
      "strength": 421.3,
      "persistence": 0.47,
      "widthBins": 9,
      "stability": {"scalePass":true,"phasePass":true,"warpPass":false,"passCount":2}
    }
  ]
}
```

### fibres.csv (optional)
Columns:
- `thetaBin, thetaRad, strength, persistence, widthBins, passCount`

---

## A11) Minimal Build Checklist (Aligns with NextSteps + FibreDetector)

1) ✅ Implement `bins[]` accumulation (A3)  
2) ✅ Compute `E` and `z` per bin (A4–A5)  
3) ✅ Render heatmap using `z` and `zMin` slider (NextSteps Phase 2)  
4) ✅ Extract Top-K fibres via `Strength(t)` + `Persistence(t)` (A6)  
5) ✅ Add fake-prime simulation overlay (A9)  
6) ✅ Add stability tests and acceptance rule (A8)  
7) ✅ Export `fibres.json` for replay/regression (A10)

---

## A12) Practical Defaults (Good starting values)

- `thetaBins = 1440`
- `radiusBins = 1000`
- `zMin = 3.5`
- `Pmin = 0.35`
- `deltaThetaBins = 3`
- Stability strength retention threshold: `>= 0.60`

---

**End of Appendix A**  
If you want Appendix B next: *worker threading + incremental binning + GPU-friendly heatmap rendering plan.*
