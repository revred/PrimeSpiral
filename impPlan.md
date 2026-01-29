# Prime Pearls Visualization Plan

## Goal
Implement interactive visualization based on the "Prime Pearls" theory.
1.  **Selection**: Hovering finds the spatially nearest Prime number.
2.  **Pearl**: Draw a white circle around the selected prime.
3.  **Springs**: Draw visual connections to the previous and next primes in the sequence ($P_{n-1}$ and $P_{n+1}$), representing the composite gaps.
4.  **K-Neighbourhood**: Highlight the $K$ spatially closest primes to reveal local structure.

## User Review Required
> [!NOTE]
> Performance: Searching for $K$ nearest neighbors on every mouse move might be expensive if done naively against all points. We will optimize by only searching within the `visibleChunks` currently rendered.

## Proposed Changes

### [Spiral Logic]
#### [MODIFY] [spiral.js](file:///c:/Code/PrimeSpiral/Page.Scripts/spiral.js)
*   **State**: Add `hoveredPrime` state.
*   **Event**: Listen to `mousemove`. Convert mouse coordinates to World coordinates.
*   **Search**:
    *   **Nearest Neighbor**: Use `Grid.queryPrimes` with a small radius around the cursor. If empty, expand radius.
    *   **K-Hood**: Once anchor is found, query `Grid.queryPrimes` again around the anchor to find $K$ spatial neighbors.
    *   **Optimization**: Leverage the existing Space Partitioning (Chunks) in `SpiralGrid` to avoid global iteration.
*   **Render**:
    *   **Density Threshold**: Only activate visualization if the screen-space distance between the selected prime and its linear neighbors is > `PEARL_THRESHOLD` (e.g., 10px). If points are too dense, do not show springs/pearls to avoid clutter.
    *   In `drawOverlay()` (or a new layer), checking if `hoveredPrime` exists.
    *   Draw **Anchor**: White ring at `hoveredPrime`.
    *   Draw **Springs**: Lines/Curves to `primeList[index-1]` and `primeList[index+1]`. Text label for gap size?
    *   Draw **Neighbors**: Find top $K$ (e.g., 5) closest points in `visibleChunks` and draw smaller highlights.

## Verification Plan
### Manual Verification
*   Open the app.
*   Move mouse over the spiral.
*   Verify a white circle snaps to the nearest prime.
*   Verify lines extend to the previous and next primes (Springs).
*   Verify other nearby primes light up (Neighborhood).
