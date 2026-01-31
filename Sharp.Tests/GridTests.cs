using Microsoft.Playwright;
using Microsoft.Playwright.NUnit;
using NUnit.Framework;

namespace Sharp.Tests
{
    [Parallelizable(ParallelScope.Self)]
    [TestFixture]
    public class GridTests : PageTest
    {
        private string GetTestHtmlPath()
        {
            // Assuming the test runs from bin/Debug/... we need to map to source
            // Or just hardcode for this environment
            return "file:///C:/Code/PrimeSpiral/Sharp.Tests/test_grid.html";
        }

        [Test]
        public async Task GridIsolation_Test()
        {
            await Page.GotoAsync(GetTestHtmlPath());

            // Wait for testStatus to be set
            await Page.WaitForFunctionAsync("() => window.testStatus !== undefined");

            var status = await Page.EvaluateAsync<string>("window.testStatus");
            Assert.That(status, Is.EqualTo("DONE"), "JS Grid Test failed or did not complete.");

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
