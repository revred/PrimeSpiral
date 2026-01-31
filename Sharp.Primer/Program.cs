using Microsoft.AspNetCore.Components.WebAssembly.Hosting;
using Microsoft.Extensions.DependencyInjection;
using System;
using System.Net.Http;
using System.Threading.Tasks;

namespace Sharp.Primer
{
    public class Program
    {
        public static async Task Main(string[] args)
        {
            var builder = WebAssemblyHostBuilder.CreateDefault(args);
            // We don't have a root component to mount because we are just a JS interop library,
            // but we need to run as an app to generate the boot.json.
            // Or we can mount a dummy one if needed, but usually empty is fine for pure interop if we use explicit JSInvokable.
            // However, Blazor usually expects a root component.
            // Let's add a simple one if needed, or just run.
            
            // builder.RootComponents.Add<App>("#app"); // usage
            
            await builder.Build().RunAsync();
        }
    }
}
