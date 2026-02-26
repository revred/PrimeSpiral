using System.Text.Json;
using Microsoft.Playwright;
using Microsoft.Playwright.Xunit;
using Xunit;

namespace Sharp.Tests
{
    public class VisualTests : PageTest
    {
        private string GetSpikeHtmlPath()
        {
            return "file:///C:/Code/PrimeSpiral/index.html";
        }

        private async Task WaitForAppReady()
        {
            await Page.GotoAsync(GetSpikeHtmlPath());
            await Expect(Page.Locator("#canvas")).ToBeVisibleAsync();
            // Wait for loading to hide or visible count to be non-zero
            try
            {
                await Expect(Page.Locator("#loading")).ToBeHiddenAsync(new LocatorAssertionsToBeHiddenOptions { Timeout = 10000 });
            }
            catch
            {
                // Fallback: wait for visible count
                await Page.WaitForFunctionAsync(@"() => {
                    const el = document.getElementById('disp-visible');
                    return el && el.innerText !== '0' && el.innerText !== '';
                }");
            }
            await Page.WaitForTimeoutAsync(1000); // Settle
        }

        [Fact]
        public async Task SeamDetection_Test()
        {
            await WaitForAppReady();

            // Zoom out to reach PIXEL mode
            for (int i = 0; i < 40; i++)
            {
                await Page.Mouse.WheelAsync(0, 100);
                await Page.WaitForTimeoutAsync(50);
            }
            await Page.WaitForTimeoutAsync(1000);

            var state = await GetState();
            Console.WriteLine($"Scale: {state.Scale}, Visible: {state.Visible}, Strategy: {state.Strategy}");

            var analysis = await AnalyzeSeams(8); // 8x8 grid
            
            Console.WriteLine($"Max Density Diff: {analysis.MaxDiff}%");
            if (analysis.HasSeam)
            {
                Console.WriteLine($"SEAM DETECTED at: {analysis.SeamLoc}");
            }

            // Assertion: Seam should be below threshold
            Assert.True(analysis.MaxDiff < 15.0, $"Seam detected at {analysis.SeamLoc} with {analysis.MaxDiff}% difference.");
        }

        [Fact]
        public async Task VisualProgression_Test()
        {
            await WaitForAppReady();

            // Perform incremental zoom out and check strategy transitions
            string prevStrategy = "VECTOR";
            bool transitionFound = false;

            for (int i = 1; i <= 30; i++)
            {
                await Page.Mouse.WheelAsync(0, 100);
                await Page.WaitForTimeoutAsync(100);

                var state = await GetState();
                if (!string.IsNullOrEmpty(state.Strategy) && state.Strategy != prevStrategy)
                {
                    Console.WriteLine($"Strategy Transition at step {i}: {prevStrategy} -> {state.Strategy}");
                    Console.WriteLine($"Scale: {state.Scale}, Visible: {state.Visible}");
                    transitionFound = true;
                    prevStrategy = state.Strategy;
                }
            }

            Assert.True(transitionFound, "Should have transitioned from VECTOR to PIXEL mode during zoom out.");
        }

        [Fact]
        public async Task PanVerification_Test()
        {
            await WaitForAppReady();

            var initial = await GetState();
            
            // Pan right (Move mouse, down, move, up)
            await Page.Mouse.MoveAsync(640, 360);
            await Page.Mouse.DownAsync();
            await Page.Mouse.MoveAsync(440, 360, new MouseMoveOptions { Steps = 5 });
            await Page.Mouse.UpAsync();
            await Page.WaitForTimeoutAsync(500);

            var pannedRight = await GetState();
            Assert.NotEqual(initial.OffsetX, pannedRight.OffsetX);
            
            // Pan down
            await Page.Mouse.MoveAsync(640, 360);
            await Page.Mouse.DownAsync();
            await Page.Mouse.MoveAsync(640, 160, new MouseMoveOptions { Steps = 5 });
            await Page.Mouse.UpAsync();
            await Page.WaitForTimeoutAsync(500);

            var pannedDown = await GetState();
            Assert.NotEqual(pannedRight.OffsetY, pannedDown.OffsetY);
        }

        [Fact]
        public async Task CornerBoundaries_Test()
        {
            await WaitForAppReady();

            // Zoom out significantly
            for (int i = 0; i < 20; i++) await Page.Mouse.WheelAsync(0, 100);
            await Page.WaitForTimeoutAsync(500);

            // Analyze corners for artifacts (from circle_debug.js)
            var cornerAnalysis = await Page.EvaluateAsync<JsonElement>(@"() => {
                const canvas = document.getElementById('canvas');
                const ctx = canvas.getContext('2d');
                const w = canvas.width;
                const h = canvas.height;
                const imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;

                const corners = [
                    { name: 'TopRight', x: w - 50, y: 50 },
                    { name: 'BottomRight', x: w - 50, y: h - 50 },
                    { name: 'BottomLeft', x: 50, y: h - 50 }
                ];

                const results = [];
                for (const corner of corners) {
                    let nonBgCount = 0;
                    for (let dy = -20; dy < 20; dy++) {
                        for (let dx = -20; dx < 20; dx++) {
                            const px = corner.x + dx;
                            const py = corner.y + dy;
                            if (px < 0 || px >= w || py < 0 || py >= h) continue;
                            const idx = (py * w + px) * 4;
                            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                            // Background is #0D0D0D (13,13,13)
                            if (r > 20 || g > 20 || b > 20) {
                                nonBgCount++;
                            }
                        }
                    }
                    results.push({ corner: corner.name, nonBgPixels: nonBgCount });
                }
                return results;
            }");

            foreach (var r in cornerAnalysis.EnumerateArray())
            {
                int count = r.GetProperty("nonBgPixels").GetInt32();
                string name = r.GetProperty("corner").GetString() ?? "Unknown";
                Console.WriteLine($"Corner {name}: {count} non-bg pixels");
                // In massive zoom out, the center might be small, corners should be mostly empty
                // Allow some small noise if necessary, but 0 is ideal.
                Assert.True(count < 200, $"Corner {name} has too many non-background pixels ({count}).");
            }
        }

        private async Task<AppState> GetState()
        {
            var json = await Page.EvaluateAsync<JsonElement>(@"() => {
                return {
                    scale: parseFloat(document.getElementById('dbg-zoom')?.innerText || '0'),
                    visible: parseInt((document.getElementById('disp-visible')?.innerText || '0').replace(/,/g, ''), 10),
                    strategy: document.getElementById('dbg-strategy-val')?.innerText || 'N/A',
                    offsetX: window.camera ? window.camera.renderOffset.x : 0,
                    offsetY: window.camera ? window.camera.renderOffset.y : 0
                };
            }");

            return new AppState
            {
                Scale = json.GetProperty("scale").GetDouble(),
                Visible = json.GetProperty("visible").GetInt32(),
                Strategy = json.GetProperty("strategy").GetString(),
                OffsetX = json.TryGetProperty("offsetX", out var ox) ? ox.GetDouble() : 0,
                OffsetY = json.TryGetProperty("offsetY", out var oy) ? oy.GetDouble() : 0
            };
        }

        private async Task<SeamAnalysis> AnalyzeSeams(int gridSize)
        {
            var json = await Page.EvaluateAsync<JsonElement>(@"gridSize => {
                const canvas = document.getElementById('canvas');
                const ctx = canvas.getContext('2d');
                const w = canvas.width;
                const h = canvas.height;
                const imageData = ctx.getImageData(0, 0, w, h);
                const data = imageData.data;

                const cellW = Math.floor(w / gridSize);
                const cellH = Math.floor(h / gridSize);
                const densities = [];

                for (let gy = 0; gy < gridSize; gy++) {
                    for (let gx = 0; gx < gridSize; gx++) {
                        let redCount = 0;
                        let totalPixels = 0;
                        for (let y = gy * cellH; y < (gy + 1) * cellH && y < h; y++) {
                            for (let x = gx * cellW; x < (gx + 1) * cellW && x < w; x++) {
                                const idx = (y * w + x) * 4;
                                if (data[idx] > 200 && data[idx + 1] < 100 && data[idx + 2] < 100) {
                                    redCount++;
                                }
                                totalPixels++;
                            }
                        }
                        densities.push({ x: gx, y: gy, density: (redCount / totalPixels * 100) });
                    }
                }

                let maxDiff = 0;
                let seamLoc = null;
                for (let i = 0; i < densities.length; i++) {
                    const cell = densities[i];
                    if (cell.x < gridSize - 1) {
                        const right = densities[i + 1];
                        const diff = Math.abs(cell.density - right.density);
                        if (diff > maxDiff) { maxDiff = diff; seamLoc = `H(${cell.x},${cell.y})-(${right.x},${right.y})`; }
                    }
                    if (cell.y < gridSize - 1) {
                        const bottom = densities[i + gridSize];
                        const diff = Math.abs(cell.density - bottom.density);
                        if (diff > maxDiff) { maxDiff = diff; seamLoc = `V(${cell.x},${cell.y})-(${bottom.x},${bottom.y})`; }
                    }
                }

                return { maxDiff, seamLoc, hasSeam: maxDiff > 5 };
            }", gridSize);

            return new SeamAnalysis
            {
                MaxDiff = json.GetProperty("maxDiff").GetDouble(),
                SeamLoc = json.GetProperty("seamLoc").GetString(),
                HasSeam = json.GetProperty("hasSeam").GetBoolean()
            };
        }

        private class AppState
        {
            public double Scale { get; set; }
            public int Visible { get; set; }
            public string? Strategy { get; set; }
            public double OffsetX { get; set; }
            public double OffsetY { get; set; }
        }

        private class SeamAnalysis
        {
            public double MaxDiff { get; set; }
            public string? SeamLoc { get; set; }
            public bool HasSeam { get; set; }
        }
    }
}
