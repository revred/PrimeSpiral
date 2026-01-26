# FibreTheoryV2.md — Prime Fibres in a Warped Spiral Field (Firm Foundation)
*A mathematically consistent theory that aligns with **FibreDetector.md** and the 

FibreTheoryV2 defines Prime Fibres as statistically significant and persistent prime-density ridges in a warped spiral embedding of the natural numbers — and it enforces stability + control tests so the detector is real.

**NextSteps.md** implementation plan.*

---

## 0) Purpose (Why this document exists)
The original **FibreTheory** introduced a strong intuition:

> Natural numbers laid onto a coiled spiral band, warped in space, can reveal “Prime Fibres”.

This V2 upgrades the theory into a **testable and non-self-deceptive framework**.

**Core principle:**
A Prime Fibre is **not** “a nice-looking curve through prime dots”.  
A Prime Fibre is a **statistically significant, persistent ridge of prime density** relative to baseline expectation.

This aligns directly with:
- **FibreDetector.md** (signal → extract → validate)
- **NextSteps.md** (heatmap → top fibres → stability tests → controls)

---

## 1) The Mathematical Object: Integer Embedding into a Warped Spiral

### 1.1 Domain of Integers
Let:
- \(n \in \mathbb{N}\) be the natural number index, \(n \ge 1\).
- \(\chi(n)\in\{0,1\}\) be the prime indicator:
  - \(\chi(n)=1\) if \(n\) is prime
  - \(\chi(n)=0\) otherwise

---

### 1.2 Spiral Coordinate Map (Canonical)
We embed each integer \(n\) into a planar field \((P,Q)\in\mathbb{R}^2\).

Define:
- radius \(\rho(n)\)
- angle \(\theta(n)\)

Mapping:
\[
P(n)=\rho(n)\cos\theta(n),\qquad Q(n)=\rho(n)\sin\theta(n)
\]

This is the **only required geometry**.

---

### 1.3 The Warp Function (The “Band Stretch/Compress” Mechanism)
To explore long-range structure without the origin dominating the view, we allow a monotone warp:

\[
\rho(n)=f(n)
\]

**Constraints on \(f\):**
1) **Monotone:** \(f(n+1) > f(n)\)  
2) **No reordering:** integers retain order  
3) **Well-conditioned:** small changes to \(f\) should not invent or delete fibres

Examples:
- Baseline: \(f(n)=\sqrt{n}\)
- Compression: \(f(n)=n^\alpha\) with \(0<\alpha<1/2\)
- Aggressive compression: \(f(n)=\log(1+n)\)

**Interpretation:**
The integer spiral is a *band* laid in space; warping is a lens.  
A real fibre must be **stable under small lens changes** (see §6).

---

### 1.4 Spiral Angle Function (Sacks/Phyllotaxis General Form)
We choose:
\[
\theta(n)=\omega n + \theta_0
\]
where:
- \(\omega\) is the angular step (e.g., golden angle variants)
- \(\theta_0\) is a phase offset

**Stability requirement:**
Real fibres should not vanish under small phase perturbations \(\theta_0\mapsto\theta_0+\delta\).

This directly matches the **PHASE Stability Test** in NextSteps.

---

## 2) The PQR Interpretation (Kept Consistent)
The original document mixed a 3D story with conflicting coordinates.

In V2 we keep PQR minimal and consistent:

- \(P,Q\): spatial embedding axes (the canvas plane)
- \(R\): a scalar “radial index coordinate” defined by:
\[
R(n)=n
\]

This avoids conflicting claims like “\(z=n\)” AND “spiral is at \(z=0\)”.

### 2.1 Optional Surface View (If you want the paraboloid story)
If you want the 3D mental model:

Define a surface in \((P,Q,R)\) space:
\[
R = g(P,Q)
\]

A natural choice (paraboloid-of-revolution) is:
\[
R = \rho^2 = f(n)^2
\]

But **implementation does not require 3D rendering**.
The detector is built in 2D with \((P,Q)\).

---

## 3) What a Prime Fibre IS (Definition that aligns with FibreDetector)

### 3.1 Prime Density Baseline (Prime Number Theorem)
Near \(n\):
\[
\mathbb{P}(n\text{ prime}) \approx \frac{1}{\ln(n)}
\]

This is the baseline expectation used in the detector scoring.

---

### 3.2 Fibre as a Density Ridge (Not a Curve)
A Prime Fibre is a **persistent region** of the \((P,Q)\) field where primes occur more densely than expected.

This requires converting dots into a density field, not eyeballing.

---

### 3.3 Polar Binning (The FibreDetector Field)
We discretize the embedded points into polar bins:

- angle bins: \(\thetaBins\)
- radius bins: \(rBins\)

Each bin stores:
- \(\text{primeCount}\)
- \(\text{totalCount}\)
- \(\text{expectedPrimeCount}\)

Expected primes in a bin:
\[
E \approx \frac{\text{totalCount}}{\ln(n_{mean})}
\]

---

### 3.4 Fibre Strength (Z-score)
For each bin:
\[
z = \frac{\text{primeCount}-E}{\sqrt{E}}
\]

Interpretation:
- \(z<2\): noise
- \(3\le z\le 5\): meaningful fibre candidate
- \(z>6\): extremely significant ridge (unlikely under baseline randomness)

This is the **mathematical definition of fibre intensity**.

---

## 4) Fibre Types: What produces fibres conceptually?

### 4.1 Modular Structure (Residue-Class Fibres)
Primes (except 2 and 3) lie in residue classes:

- \(p\equiv 1 \pmod 6\)
- \(p\equiv 5 \pmod 6\)

Fibre clarity often improves if we filter primes by congruence classes:

- \(p\bmod 6\)
- \(p\bmod 30\)
- \(p\bmod 210\)

This matches NextSteps Phase 4.

---

### 4.2 Quadratic / Polynomial Families (Prime-rich streak sources)
Many “visible streaks” arise from polynomial families:

\[
n(k)=ak^2+bk+c
\]

These can be fibre *generators* (candidates), but:

**Black & white rule:**
A polynomial curve is not a fibre unless it scores as a density ridge in the field.

---

## 5) The Fibre Control Plane (Exploration Interface)
We allow the user to explore parametric families via:

\[
n(\phi)=A\phi^2 + B\phi + C
\]

- \(A\): curvature class
- \(B\): drift / alignment
- \(C\): anchor / offset

This is treated as a **hypothesis generator**.

**Detector alignment requirement:**
Any displayed “thread” must show its:
- strength score
- persistence score
- stability score

Otherwise it remains an unverified overlay.

---

## 6) Validation (Non-negotiable; eliminates fake fibres)

### 6.1 Stability Tests (Mandatory)
A real fibre must remain detectable under:

1) **SCALE:** dot radius / pixel sampling changes  
2) **PHASE:** \(\theta_0 \mapsto \theta_0+\delta\)  
3) **WARP:** \(f(n)\mapsto f'(n)\) small change

This is identical to **NextSteps Phase 1**.

A fibre is considered “real” if it survives **≥ 2/3** tests.

---

### 6.2 Control Groups (Must-have)
To ensure fibres are not geometry artefacts, compute the same heatmap for:

- composites
- multiples of 3
- multiples of 5
- multiples of 7

If the same fibres appear identically across controls:
**they are not prime fibres.**

---

### 6.3 Fake Prime Field (Prime-like Simulation)
Generate synthetic “primes” using:
\[
\tilde\chi(n) \sim \text{Bernoulli}\left(\frac{1}{\ln(n)}\right)
\]

Render and score the same way.

**Rule:**
If fake primes produce similar ridge patterns with similar strength/persistence:
- the fibre is likely a spiral artefact or binning alias.

---

## 7) The Oracle & FibreMarker (Where they fit, safely)

### 7.1 Oracle (Click → Fit → Validate → Predict)
Given 2–4 prime anchor points, the Oracle proposes a fibre family (e.g., quadratic parameters).

But Oracle output is *not accepted* unless:
- heatmap z-score support exists along the proposed rail
- persistence exceeds threshold
- stability score passes

This aligns with **FibreDetector Priority 3** (Oracle comes after signal field).

---

### 7.2 FibreMarker Chain Tracing (Proposal Generator)
Nearest-neighbour chaining can “draw fibres” in random fields.

So FibreMarker is treated as:
✅ a generator of candidate rails  
❌ not proof

Every traced fibre must go through:
- ridge scoring
- persistence scoring
- stability tests
- control rejection tests

---

## 8) The Prime Fibre Spectrum (The Stellar Payoff)
If fibres survive all validation steps, we can extract a stable set of “fibre angles”:

- top-k angles ranked by ridge strength
- persistence across radius bands
- stability across warp/phase perturbations

This yields a **Prime Fibre Spectrum**:
a measurable fingerprint of prime structure under the embedding.

This is the bridge from “beautiful visualization” to “research-grade phenomenon”.

---

## 9) Implementation Alignment (Exact build order)
This document assumes implementation follows the NextSteps build order:

1) Polar binning grid (θBins × rBins)
2) Expected prime density model (1/ln(n))
3) z-score heatmap overlay
4) Top-K fibre extraction
5) Persistence + width
6) Control groups + fake primes
7) Stability mode
8) Oracle (only once foundation is solid)

---

## 10) Success Criteria (Black & White)
The theory is validated if:

✅ Top-K fibres repeat for increasing maxN  
✅ Fibre strength grows with N (signal dominates noise)  
✅ Fibres survive ≥ 2/3 stability tests  
✅ Fibres are stronger than fake-prime field  
✅ Modular filtering sharpens specific fibres  

---

## One-line conclusion
**FibreTheoryV2 defines Prime Fibres as statistically significant, persistent ridges in a warped spiral prime-density field, with mandatory stability + control validation — fully aligned with FibreDetector and NextSteps.**
