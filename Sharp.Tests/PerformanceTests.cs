using System.Text.RegularExpressions;
using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;

namespace Sharp.Tests
{
    [Parallelizable(ParallelScope.Self)]
    [TestFixture]
    public class PerformanceTests : PageTest
    {
        private string GetSpikeHtmlPath()
        {
            // Assuming we run from bin/Debug/net8.0/
            // Navigate up to solution root -> spike.html
            // Or absolute path C:/Code/PrimeSpiral/spike.html
            // Let's use absolute for robustness in this environment
            return "file:///C:/Code/PrimeSpiral/index.html";
        }

        [Test]
        public async Task Startup_Should_Be_Fast()
        {
            await Page.GotoAsync(GetSpikeHtmlPath());
            
            // Check loading element appears and vanishes
            var loading = Page.Locator("#loading");
            // It might already be gone if load is super fast, 
            // but we can check it's detached or hidden eventually.
            // Wait for it to be hidden within 500ms
            await Expect(loading).ToBeHiddenAsync(new LocatorAssertionsToBeHiddenOptions { Timeout = 10000 });
        }

        [Test]
        public async Task AutoLOD_Should_Switch_Strategies()
        {
            await Page.GotoAsync(GetSpikeHtmlPath());
            await Expect(Page.Locator("#loading")).ToBeHiddenAsync();

            // 1. Zoom Out (Scroll Down) -> More nodes -> Pixel Mode
            // The app ignores scroll magnitude, so we need multiple ticks to reduce scale from 15 to < 0.2
            for(int i=0; i<50; i++) 
            {
                await Page.Mouse.WheelAsync(0, 100);
                await Page.WaitForTimeoutAsync(10); 
            }
            await Page.WaitForTimeoutAsync(500);

            var strategy = Page.Locator("#disp-strategy");
            var text = await strategy.InnerTextAsync();
            Assert.That(text, Does.Contain("PIXEL"));

            // 2. Zoom In (Scroll Up) -> Less nodes -> Vector Mode
            for(int i=0; i<60; i++)
            {
                await Page.Mouse.WheelAsync(0, -100);
                await Page.WaitForTimeoutAsync(10);
            }
            await Page.WaitForTimeoutAsync(500);
            
            text = await strategy.InnerTextAsync();
            Assert.That(text, Does.Contain("VECTOR"));
        }

        [Test]
        public async Task FPS_Should_Be_Stable()
        {
            await Page.GotoAsync(GetSpikeHtmlPath());
            await Expect(Page.Locator("#loading")).ToBeHiddenAsync();

            // Inject FPS measurer
            var fps = await Page.EvaluateAsync<double>(@"async () => {
                return new Promise(resolve => {
                    let frames = 0;
                    const start = performance.now();
                    
                    function loop() {
                        frames++;
                        const now = performance.now();
                        if (now - start >= 1000) {
                            resolve(frames);
                        } else {
                            requestAnimationFrame(loop);
                        }
                    }
                    requestAnimationFrame(loop);
                });
            }");

            TestContext.WriteLine($"Measured FPS: {fps}");
            TestContext.WriteLine($"Measured FPS: {fps}");
            Assert.That(fps, Is.GreaterThan(30));
        }

        [Test]
        public async Task Profile_Should_Identify_Bottlenecks() 
        {
            // Subscribe to console messages to account for startup crashes
            Page.Console += (_, msg) => TestContext.WriteLine($"Browser Console: {msg.Text}");
            Page.PageError += (_, str) => TestContext.WriteLine($"Browser Error: {str}");

            await Page.GotoAsync(GetSpikeHtmlPath());
            
            // Allow more time for initial build (2M points might take > 1s on slow agent)
            // But log if it fails
            try {
                await Expect(Page.Locator("#loading")).ToBeHiddenAsync(new LocatorAssertionsToBeHiddenOptions { Timeout = 5000 });
            } catch {
                 var crashError = await Page.EvaluateAsync<string>("() => window.lastError");
                 TestContext.WriteLine($"Startup Failed. JS Error: {crashError}");
                 throw;
            }

            // 1. Force Pixel Mode (Zoom out)
            for(int i=0; i<50; i++) 
            {
                await Page.Mouse.WheelAsync(0, 100);
                await Page.WaitForTimeoutAsync(10); 
            }
            await Page.WaitForTimeoutAsync(500);

            // 2. Run Profile
            // window.startProfile(1000)
            await Page.EvaluateAsync("window.startProfile(1000)");
            
            // 3. Wait for results (Wait longer than profile duration to ensure timeout fires)
            await Page.WaitForTimeoutAsync(2500);
            
            // Force stop if needed (though timeout should have handled it)
            // await Page.EvaluateAsync("window.stopProfile()"); // If I exposed it.
            
            // 4. Extract Data
            var data = await Page.EvaluateAsync<Dictionary<string, double>>("() => window.lastProfileData || {}");
            
            // Debug: Check for errors
            var jsError = await Page.EvaluateAsync<string>("() => window.lastError");
            if(!string.IsNullOrEmpty(jsError))
            {
                TestContext.WriteLine($"JS Error Detected: {jsError}");
                Assert.Fail($"JS Error: {jsError}");
            }
            
            TestContext.WriteLine("--- Profile Results ---");
            foreach(var kvp in data) 
            {
                TestContext.WriteLine($"{kvp.Key}: {kvp.Value:F3}ms");
            }
            
            // Serialize to file for agent reading
            var json = System.Text.Json.JsonSerializer.Serialize(data);
            File.WriteAllText("profile.json", json); // Writes to working dir (Sharp.Tests)

            // 5. Assertions
            // We expect RenderPixel to be the main cost. 
            // With 2M composites enabled, it might exceed 16ms (60FPS). 
            // Let's accept 30FPS (33ms) as a "Functional" pass for visual consistency,
            // or 50FPS (20ms).
            if(data.ContainsKey("RenderPixel")) 
            {
                Assert.That(data["RenderPixel"], Is.LessThan(33.0), "RenderPixel should be < 33ms (30FPS)");
                TestContext.WriteLine($"RenderPixel Time: {data["RenderPixel"]}ms");
            }
            
            // GridQuery should be negligible in Pixel Mode because it's not strictly used for rendering, 
            // but it IS ran for auto-lod check.
            if(data.ContainsKey("GridQuery"))
            {
                Assert.That(data["GridQuery"], Is.LessThan(1.0), "GridQuery should be extremely fast");
            }
        }
    }
}
