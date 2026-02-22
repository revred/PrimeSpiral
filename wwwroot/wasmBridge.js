// WASM Bridge for Sharp.Primer

window.wasmEngine = {
    isReady: false,
    sharcReady: false,

    init: async function () {
        console.log("WASM: Initializing...");
        // Blazor is manually started below
        try {
            await this.waitForRuntime();
            console.log("WASM: Runtime Ready");
            this.isReady = true;
            this.test();
            await this.setTransform(1, 120, true);
            // Progressive Load:
            // 1. Initial fast load (2M points)
            const INITIAL_LIMIT = 2000000;
            const FINAL_LIMIT = 500000000;

            console.log("WASM: Initial fast load...");
            this.buildGrid(INITIAL_LIMIT);
            this.initSharc(INITIAL_LIMIT).then(result => {
                console.log(`WASM: ${result}`);
                this.sharcReady = true;
                this._updateSharcHud(result);

                // Note: The 500,000,000 background load was causing a System.OutOfMemoryException
                // in the browser WASM engine. Keeping it disabled for now to ensure a stable visualization.
                console.log("WASM: Background full load disabled to prevent OOM.");
            }).catch(err => {
                console.warn("WASM: Sharc init deferred:", err);
            });
        } catch (e) {
            console.error("WASM: Initialization Failed", e);
        }
    },

    waitForRuntime: function () {
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const check = async () => {
                try {
                    if (typeof DotNet !== 'undefined' && DotNet.invokeMethodAsync) {
                        // TEST CALL to verify dispatcher is actually ready
                        await DotNet.invokeMethodAsync('Sharp.Primer', 'SayHello');
                        console.log("WASM: Dispatcher confirmed ready.");
                        resolve();
                    } else {
                        throw new Error("DotNet bridge not yet present");
                    }
                } catch (e) {
                    attempts++;
                    // "No call dispatcher" is the expected error while booting
                    if (attempts % 50 === 0) console.log(`WASM: Waiting for dispatcher... (${attempts}) - Error: ${e.message}`);

                    if (attempts > 300) reject("Timeout waiting for DotNet Dispatcher: " + e.message);
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

    // ─── Sharc Database Methods ──────────────────────────────────
    initSharc: async function (limit) {
        if (!this.isReady) await this.waitForRuntime();
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'InitSharcStore', limit);
    },

    sharcIsPrime: async function (n) {
        if (!this.sharcReady) return false;
        // Logic: The absence of a number in the db indicates it is composite 
        // till the limit of what is computed max prime number.
        const result = await DotNet.invokeMethodAsync('Sharp.Primer', 'SharcIsPrime', n);
        return result === true;
    },

    sharcGetPrimesInRange: async function (minN, maxN) {
        if (!this.sharcReady) return [];
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'SharcGetPrimesInRange', minN, maxN);
    },

    sharcGetNearestPrime: async function (x, y, maxDist) {
        if (!this.sharcReady) return -1;
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'SharcGetNearestPrime', x, y, maxDist);
    },

    sharcGetSchema: async function () {
        if (!this.sharcReady) return null;
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'SharcGetSchema');
    },

    sharcGetStats: async function () {
        if (!this.sharcReady) return null;
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'SharcGetStats');
    },

    sharcBenchmarkSeek: async function (iterations) {
        if (!this.sharcReady) return "Sharc not ready";
        return await DotNet.invokeMethodAsync('Sharp.Primer', 'SharcBenchmarkSeek', iterations || 10000);
    },

    _updateSharcHud: function (statusText, type = 'ok') {
        const el = document.getElementById('sharc-status');
        if (el) {
            el.className = `sharc-badge ${type}`;
            el.innerHTML = `<div style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></div>${type === 'loading' ? 'SHARC LOADING' : 'SHARC OK'}`;
            console.log(`[Sharc HUD] Updated (${type}): ${statusText}`);
        }
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

// Initializer to handle engine setup once Blazor is ready
(function () {
    const HUD_STATUS_ID = 'sharc-status';

    function updateHud(text, type) {
        const el = document.getElementById(HUD_STATUS_ID);
        if (el) {
            el.className = `sharc-badge ${type}`;
            el.innerHTML = `<div style="width: 6px; height: 6px; border-radius: 50%; background: currentColor;"></div>${text}`;
        }
    }

    async function initBridge() {
        console.log("WASM: Waiting for .NET 10 Runtime...");
        if (window.Blazor && typeof Blazor.start === 'function') {
            console.log("WASM: Manually starting Blazor...");
            await Blazor.start();
        }

        const start = Date.now();
        const timeout = 20000;

        const checkRuntime = setInterval(async () => {
            if (window.DotNet) {
                clearInterval(checkRuntime);
                console.log("WASM: .NET 10 Runtime Ready.");
                try {
                    await window.wasmEngine.init();
                    console.log("WASM: Bridge Initialized.");
                } catch (e) {
                    console.error("WASM: Initialization Failed", e);
                    updateHud("ENGINE ERROR", "error");
                }
            } else if (Date.now() - start > timeout) {
                clearInterval(checkRuntime);
                console.error("WASM: Timeout waiting for DotNet runtime.");
                updateHud("ENGINE TIMEOUT", "error");
            }
        }, 100);
    }

    if (document.readyState === 'complete') {
        initBridge();
    } else {
        window.addEventListener('load', initBridge);
    }
})();
