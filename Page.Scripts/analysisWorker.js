/**
 * Analysis Worker for Prime Spiral
 * 
 * Computes Polar Density Grid and Z-Scores in background.
 */
self.onmessage = function (e) {
    const { maxNumber, minNumber, rBins, thetaBins } = e.data; // Added minNumber

    console.log(`[Worker] Starting Analysis: Range [${minNumber} .. ${maxNumber}], Grid=${rBins}x${thetaBins}`);
    const start = performance.now();

    try {
        // 1. Sieve Primes
        const primeMap = new Uint8Array(maxNumber + 1);
        primeMap.fill(1);
        primeMap[0] = 0;
        primeMap[1] = 0;
        for (let i = 2; i * i <= maxNumber; i++) {
            if (primeMap[i]) {
                for (let j = i * i; j <= maxNumber; j += i) primeMap[j] = 0;
            }
        }

        // 2. Initialize Bins
        const totalBins = rBins * thetaBins;

        // 3. Binning Loop (Single Pass)
        const primeCounts = new Int32Array(totalBins);
        const expCounts = new Float32Array(totalBins);
        const zGrid = new Float32Array(totalBins);
        const maxR = Math.sqrt(maxNumber);
        const PI2 = Math.PI * 2;
        let maxZ = 0;

        // Start from minNumber (or 2 if min < 2)
        const startN = Math.max(2, minNumber || 2);

        for (let n = startN; n <= maxNumber; n++) {
            const root = Math.sqrt(n);
            const theta = (root * PI2) % PI2; // 0 to 2PI

            // Map to bins
            let rIdx = Math.floor((root / maxR) * rBins);
            if (rIdx >= rBins) rIdx = rBins - 1;

            let tIdx = Math.floor((theta / PI2) * thetaBins);
            if (tIdx >= thetaBins) tIdx = thetaBins - 1;

            const binIdx = rIdx * thetaBins + tIdx;

            if (primeMap[n]) primeCounts[binIdx]++;
            expCounts[binIdx] += 1.0 / Math.log(n);
        }

        // 4. Calculate Z-Scores
        for (let i = 0; i < totalBins; i++) {
            const obs = primeCounts[i];
            const exp = expCounts[i];
            if (exp > 0.001) {
                zGrid[i] = (obs - exp) / Math.sqrt(exp);
            }
        }

        // --- SMOOTHING (Gaussian Kernel [0.25, 0.5, 0.25]) ---
        // Smooth along Theta axis to reduce aliasing noise
        const smoothedZ = new Float32Array(totalBins);

        for (let r = 0; r < rBins; r++) {
            for (let t = 0; t < thetaBins; t++) {
                const idx = r * thetaBins + t;

                // Wrap indices
                const tLeft = (t - 1 + thetaBins) % thetaBins;
                const tRight = (t + 1) % thetaBins;

                const idxLeft = r * thetaBins + tLeft;
                const idxRight = r * thetaBins + tRight;

                const val = zGrid[idx] * 0.5 + zGrid[idxLeft] * 0.25 + zGrid[idxRight] * 0.25;
                smoothedZ[idx] = val;
                if (val > maxZ) maxZ = val; // Re-track max
            }
        }

        // Copy back
        zGrid.set(smoothedZ);

        const time = performance.now() - start;
        console.log(`[Worker] Analysis Complete: MaxZ=${maxZ.toFixed(2)} in ${time.toFixed(0)}ms`);

        self.postMessage({
            type: 'RESULT',
            zGrid: zGrid,
            maxZ: maxZ,
            rBins,
            thetaBins,
            maxR
        }, [zGrid.buffer]); // Transfer

    } catch (err) {
        console.error(err);
        self.postMessage({ type: 'ERROR', message: err.message });
    }
};
