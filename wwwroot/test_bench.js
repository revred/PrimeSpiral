// test_bench.js
console.log("--- TEST BENCH LOADED ---");

window.TestBench = {
    run: async () => {
        console.log("Running Tests...");
        const results = {};

        // 1. JS Grid Test
        try {
            if (!window.grid) throw new Error("Grid not initialized");

            // Seed some data if empty (for unit test isolation)
            if (typeof cacheX === 'undefined') {
                console.warn("Seeding Mock Data for Test...");
                window.cacheX = new Float32Array(1000);
                window.cacheY = new Float32Array(1000);
                window.primeMap = new Uint8Array(1000);
                window.maxNumber = 999;
                window.minNumber = 0;
                for (let i = 0; i < 1000; i++) {
                    cacheX[i] = i; cacheY[i] = i; // Diagonal line
                    if (i % 2 !== 0) primeMap[i] = 1; // Odd "primes"
                }
                grid.build();
            }

            const t1 = performance.now();
            const res = grid.query(0, 0, 100, 100);
            const t2 = performance.now();

            results.jsGrid = {
                status: "PASS",
                count: res.count,
                time: (t2 - t1).toFixed(4) + "ms"
            };

            // Test JS Fallback if implemented
            if (grid.getNearest) {
                const near = grid.getNearest(50, 50, 10);
                const neighbors = grid.getNeighbors(near, 3);
                results.jsNearest = {
                    status: "PASS",
                    found: near,
                    neighbors: neighbors.length
                };
            } else {
                results.jsNearest = { status: "SKIP (Not Implemented)" };
            }

        } catch (e) {
            results.jsGrid = { status: "FAIL", error: e.message };
        }

        // 2. WASM Engine Test
        try {
            if (window.wasmEngine && window.wasmEngine.isReady) {
                const t1 = performance.now();
                const near = await window.wasmEngine.getNearest(0, 0, 100);
                const t2 = performance.now();
                results.wasm = {
                    status: "PASS",
                    found: near,
                    time: (t2 - t1).toFixed(4) + "ms"
                };
            } else {
                results.wasm = { status: "SKIP (Not Ready/Loaded)" };
            }
        } catch (e) {
            results.wasm = { status: "FAIL", error: e.message };
        }

        console.table(results);
        return results;
    }
};
