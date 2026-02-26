# Automation & Performance Strategy

To ensure `PrimeSpiral` maintains its "Lightning Fast" performance (60fps @ 2M points) and preventing regression, we define the following automation strategy (`Sharp.Strategy`) and verification tasks.

## 1. Algorithmic Verification (C#)

### Context
The Core Logic (Sieve, Coordinate Math, Spatial Partitioning) is mirrored in `Sharp.Benchmark`. This allows for stable, noise-free CPU profiling outside the browser.

### Verification Tasks
- [x] **Benchmark CI Job**: Run `Sharp.Benchmark` (Release Mode).
- [x] **Threshold Assertions**: Hard-coded limits in `Program.cs` enforce <20ms Sieve and <0.05ms Query.

## 2. Rendering Verification (C# / xUnit)

### Context
We use **xUnit + Microsoft Playwright** in `Sharp.Tests` to verify the application behavior end-to-end. This eliminates the need for Node.js modules or external JS scripts.

### Verification Tasks
- [x] **Frame Analysis**: `PerformanceTests.cs` verifies `FPS > 30` and startup speed.
- [x] **LOD Safety**: `PerformanceTests.cs` and `VisualTests.cs` verify strategy switching.
- [x] **Visual Analysis**: `VisualTests.cs` ports previous JS agent logic for seam detection, panning, and corner analysis.
- [x] **Startup**: Verify `#loading` disappears within acceptable time limits.

### Verification Tasks
- [ ] **Frame Analysis Test**:
    1.  Load `index.html`.
    2.  Wait for `#loading` to disappear.
    3.  Inject a `performance.now()` loop to capture `requestAnimationFrame` deltas.
    4.  Script: Zoom Out (Pixel Mode) -> Wait 1s -> Zoom In (Vector Mode) -> Pan.
    5.  **Assert**: 95th percentile frametime `< 16.6ms`.
- [ ] **LOD Safety Check**:
    1.  Force view to intermediate zoom (e.g. scale=0.3).
    2.  Query DOM `#disp-strategy`.
    3.  **Assert**: Value is `PIXEL` (Safety Cap Engaged).
- [ ] **Startup Time**:
    1.  Measure time from Navigation to `#loading` removal.
    2.  **Assert**: `< 500ms`.

## 3. Regression Prevention

### Strategy
-   **Pre-Commit**: Run `Sharp.Benchmark` locally.
-   **Monitoring**: Use the built-in UI Telemetry (`#disp-fps`, `#disp-render-time`) during manual review.
-   **Golden Metrics**: Maintain a file `metrics.json` tracking historical benchmark results to spot slow drift.

## 4. Environment Setup (Fixing the $HOME Issue)
The current Browser Agent failed due to a missing `$HOME` variable.
-   **Fix**: Ensure the test runner environment (CI/CD or Local Shell) has user profile variables properly loaded.
-   **Retry**: Once environment is fixed, re-run the `browser_subagent` verification flow defined in previous tasks.
