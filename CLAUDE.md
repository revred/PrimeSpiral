# CLAUDE.md — Prime Spiral Explorer (Context Pack)

## Goal

We are building an advanced interactive prime visualization using the **Sacks Spiral** and canvas.

This repo is meant to be explored and extended using Claude (or any LLM) with full context:
- high performance rendering
- viewport culling
- hover snap tooltip
- optional grid and square anchors
- **nonlinear radial compression** so numbers close to 0 occupy less space

## Current Implementation (v3)

File:
- `prime_spiral_v3_warp.html`

Key components:
1. **Prime map generation**
   - `Uint8Array primeMap`
   - Sieve of Eratosthenes up to `MAX_NUMBER`

2. **Sacks spiral placement**
   - `r = sqrt(n)`
   - `theta = 2π * sqrt(n)`
   - `(x, y) = (-cos(theta)*r, sin(theta)*r)`

3. **Spatial culling**
   - Convert screen corners to *world coordinates* (in current render space)
   - Compute min/max radii that intersect the viewport
   - Convert radii back to `n` via `n = r^2`
   - Iterate only `startN..endN`

4. **Radial compression ("Warp")**
   - Purpose: shrink the inner region (near 0) to expose much larger n-range on screen
   - Warp is invertible to preserve culling correctness

### Warp equations

Forward warp:

- `rw = r^2 / (r + R0)`

Inverse warp:

- `r = 0.5 * (rw + sqrt(rw^2 + 4*rw*R0))`

### Why warp must be invertible

Culling computes which N range is visible.
If we warp the positions but do not invert the warp when culling, we will cull wrong:
- either draw too many points (slow)
- or draw the wrong points (missing geometry)

So: viewport radii are measured in **warped space**, then inverted to **true space** before mapping to N.

## Next upgrades (suggested)

### A) “Outer compression” mode
For viewing *hundreds of millions* on a single screen:
- Use log radius mapping or power-law:
  - `rw = log(1 + k*r)`  (invertible)
  - or `rw = r^a` (invertible for a>0)
- This enables galaxy-scale exploration.

### B) Better culling accuracy
Current minDist is an approximation.
We can compute exact minimum distance from origin to rectangle for better skipping when far away.

### C) Progressive sieve
Instead of pre-sieving 2 million up front, we can:
- sieve in chunks
- or use a segmented sieve
This enables much higher MAX_NUMBER without long startup.

### D) Tile cache rendering
Cache pixels into tiles at fixed zoom ranges.

### E) Faster prime test at runtime
Use Miller-Rabin for pointwise prime checks when MAX_NUMBER becomes extremely large.

## Constraints / UX preferences

- Stay smooth (60fps) while panning/zooming
- Avoid lag even when exploring far out
- Tooltip must remain responsive
- Composite dots can be skipped when zoomed out

## What to ask Claude to do

Examples:

1) “Add an outer log warp mode and keep culling correct.”
2) “Implement segmented sieve to support MAX_NUMBER = 50,000,000.”
3) “Make dot size adapt by density: more points => smaller dots.”
4) “Add a search box to jump to a specific number n.”
