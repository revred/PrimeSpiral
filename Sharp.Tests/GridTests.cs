using Microsoft.Playwright;
using Microsoft.Playwright.Xunit;
using Xunit;

namespace Sharp.Tests
{
    public class GridTests : PageTest
    {
        private string GetTestHtmlPath()
        {
            // Assuming the test runs from bin/Debug/... we need to map to source
            // Or just hardcode for this environment
            return "file:///C:/Code/PrimeSpiral/Sharp.Tests/test_grid.html";
        }

        [Fact]
        public async Task GridIsolation_Test()
        {
            await Page.GotoAsync(GetTestHtmlPath());

            // Wait for testStatus to be set
            await Page.WaitForFunctionAsync("() => window.testStatus !== undefined");

            var status = await Page.EvaluateAsync<string>("window.testStatus");
            Assert.True(status == "DONE", $"JS Grid Test failed or did not complete. Status: {status}");

            // Verify visual logs
            var logs = await Page.Locator("#results div").AllTextContentsAsync();
            foreach (var log in logs)
            {
                if (log.Contains("Failed"))
                {
                    Assert.Fail($"JS Test Failure: {log}");
                }
            }
        }
    }
}
