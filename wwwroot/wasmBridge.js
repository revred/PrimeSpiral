// WASM Bridge for Sharp.Primer

window.wasmEngine = {
    isReady: false,
    init: async function () {
        console.log("WASM: Initializing...");
        // Blazor is manually started below
        try {
            await this.waitForRuntime();
            console.log("WASM: Runtime Ready");
            this.isReady = true;
            this.test();
            await this.setTransform(1, 120, true);
            // Auto-build grid on init to unblock user immediately
            this.buildGrid(2000000);
        } catch (e) {
            console.error("WASM: Initialization Failed", e);
        }
    },

    waitForRuntime: function () {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = () => {
                if (typeof DotNet !== 'undefined') {
                    resolve();
                } else {
                    attempts++;
                    if (attempts > 100) reject("Timeout waiting for DotNet");
                    else setTimeout(check, 100);
                }
            };
            check();
        });
    },

    buildGrid: async function (limit) {
        if (!this.isReady) await this.waitForRuntime();
        const startTime = performance.now();
        const result = await DotNet.invokeMethodAsync('Sharp.Primer', 'BuildGrid', limit);
        console.log(`WASM: BuildGrid Result: ${result}`);
        console.log(`WASM: Grid Built in ${(performance.now() - startTime).toFixed(2)}ms`);
    },

    setTransform: async function (spacing, r0, useWarp) {
        if (!this.isReady) await this.waitForRuntime();
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'SetTransform', spacing, r0, useWarp);
    },

    getNearest: async function (x, y, maxDist) {
        if (!this.isReady) return -1;
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'GetNearest', x, y, maxDist);
    },

    getNeighborhoodIds: async function (x, y, maxDist, count) {
        if (!this.isReady) return [];
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'GetNeighborhoodIds', x, y, maxDist, count);
    },

    getNeighborIds: async function (centerId, count) {
        if (!this.isReady) return [];
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'GetNeighborIds', centerId, count);
    },

    getNeighbors: async function (centerId, count) {
        if (!this.isReady) return [];
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'GetNeighbors', centerId, count);
    },

    getPrimeMap: async function (limit) {
        if (!this.isReady) return null;
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'GetPrimeMap', limit);
    },

    getDensityMap: async function (maxNumber, rBins, thetaBins) {
        if (!this.isReady) {
            console.warn("WASM not ready for Density Map");
            return null;
        }
        // Direct call without benchmark logging here, usage is shifted to C# benchmark or internal logs
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'GetDensityMap', maxNumber, rBins, thetaBins);
    },

    // --- Benchmarks ---
    runBenchmarks: async function () {
        if (!this.isReady) return "WASM Not Ready";
        let results = [];

        console.log("Running C# Benchmarks...");

        // 1. Grid Build
        results.push(await DotNet.invokeMethodAsync('Sharp.Primer', 'BenchmarkGrid', 100000));

        // 2. Query
        results.push(await DotNet.invokeMethodAsync('Sharp.Primer', 'BenchmarkQuery', 1000, 50.0));

        // 3. Density
        results.push(await DotNet.invokeMethodAsync('Sharp.Primer', 'BenchmarkDensity', 100000, 200, 360));

        console.table(results);
        return results;
    },

    test: async function () {
        const msg = await DotNet.invokeMethodAsync('Sharp.Primer', 'SayHello');
        console.log("WASM Test:", msg);
    }
};

// Manual start to handle non-root folder
// Manual start to handle non-root folder
(function () {
    function startBlazor() {
        console.log("WASM: Starting Blazor manually...");
        // Helper to show error on screen
        function showError(msg) {
            const el = document.getElementById('loading');
            if (el) {
                el.innerText = "ERROR: " + msg;
                el.style.color = "red";
            }
            console.error(msg);
        }

        try {
            Blazor.start({
                // Redirect resource loading to wwwroot/_framework
                loadBootResource: function (type, name, defaultUri, integrity) {
                    // console.log(`Loading: ${type} ${name}`); 
                    return `wwwroot/_framework/${name}`;
                }
            }).then(() => {
                console.log("WASM: Blazor started successfully");
                window.wasmEngine.init();
            }).catch(err => {
                showError("Blazor Start Failed: " + err);
            });
        } catch (e) {
            showError("Exception during start: " + e);
        }
    }

    if (document.readyState === 'complete') {
        startBlazor();
    } else {
        window.addEventListener('load', startBlazor);
    }
})();
