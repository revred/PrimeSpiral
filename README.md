# High-Performance Prime (Sacks) Spiral

A "Lightning Fast" implementation of the Sacks Spiral using **Hybrid Rendering** and **Spatial Partitioning**.

## 🚀 Live Demo
You can view the live interactive demo here: **[Prime Spiral Explorer](https://revred.github.io/PrimeSpiral/)**

Alternatively, open `index.html` locally in your browser.

## ⚡ Architecture
This engine renders **2,000,000 points** at **60 FPS** using a sophisticated three-layer architecture:

1.  **Spatial Partitioning (`SpiralGrid`)**: The world is divided into **100x100** spatial buckets. This allows logarithmic time culling (Frustum Culling) and O(1) hover detection.
2.  **Hybrid Rendering Engine**: 
    -   **Pixel Mode**: Uses direct pixel manipulation (`putImageData`) for dense zones (>60k nodes) to prevent GPU bottlenecks.
    -   **Vector Mode**: Switches to high-quality vector shapes (Canvas API) for detailed views.
3.  **Coordinate Caching**: All geometry is pre-calculated into `Float32Array` buffers during async initialization.

## 📂 Project Structure

-   **`spike.html`**: The main entry point for the browser-based visualization.
-   **`spiral.js`**: The core application logic (Rendering, Spatial Grid, Auto-LOD).
-   **`Sharp.Benchmark/`**: C# Console App for algorithmic regression testing.
-   **`Sharp.Tests/`**: C# NUnit Project using Playwright for E2E browser verification.
-   **`Sharp.Strategy/`**: Strategic documentation and automation plans.

## 📊 Performance Benchmarks (C# Verification)
To prove the efficiency of the underlying data structures, we benchmarked the algorithms in C# (`Sharp.Benchmark`). The results act as a regression gate for the project.

| CATEGORY        | TEST NAME                 |  TIME (ms) | LIMIT (ms) | STATUS |
|-----------------|---------------------------|------------|------------|--------|
| Algorithm       | Sieve (2M Primes)         |      8.499 |     20.000 | **PASS**   |
| Math            | Coordinate Pre-calc       |     50.772 |    100.000 | **PASS**   |
| Data Structure  | Spatial Grid Build        |     56.841 |    100.000 | **PASS**   |
| Query           | Frustum Cull (View)       |      0.017 |      0.050 | **PASS**   |

*(System: Windows 10, Ryzen/Intel i7 class)*

For detailed verification strategy, see: [Automation Strategy](file:///c:/Code/PrimeSpiral/Sharp.Strategy/Automation_Strategy.md)

*System: Windows 10, Ryzen/Intel i7 class*

## Controls
-   **Scroll**: Zoom In/Out (Seamless transition between Pixel/Vector modes)
-   **Drag**: Pan the infinite canvas.
-   **Warp Slider**: Adjust the `R0` parameter to compress the spiral center.
-   **Debug**: Enable "Show Data Chunks" to visualize the spatial partitioning system.
- **Radius**: `r = sqrt(n)`
- **Angle**: `theta = 2π * sqrt(n)`

## What’s included

✅ **Spatial culling** — only draws numbers that could be visible on-screen  
✅ **Prime sieve** up to `MAX_NUMBER = 2,000,000`  
✅ **Hover tooltip** — snaps to nearest visible number  
✅ **Grid toggle** — draw line segments between successive points  
✅ **Squares highlight** — perfect squares show up as blue anchors  
✅ **NEW: Origin compression (Warp)** — shrinks the near-zero region so you can explore further out with less “wasted space”

## Run

Open:

- `index.html`

in any modern browser (Chrome/Edge/Firefox).

## Controls

- Mouse Wheel: Zoom
- Drag: Pan
- Hover: Tooltip

## Notes on the Warp

We apply a radial warp:

```
rw = r^2 / (r + R0)
```

This compresses small radii but becomes ~identity for large radii.

To keep culling correct, we invert it:

```
r = 0.5 * (rw + sqrt(rw^2 + 4*rw*R0))
```

So the renderer still picks the correct `startN..endN` range even when warped.
