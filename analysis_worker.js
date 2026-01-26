/**
 * Analysis Worker for Prime Spiral
 * 
 * Computes Polar Density Grid and Z-Scores in background.
 * 
 * Input:
 * - maxNumber: int
 * - rBins: int (e.g., 500)
 * - thetaBins: int (e.g., 720)
 * 
 * Output:
 * - zGrid: Float32Array (size rBins * thetaBins)
 * - maxZ: float
 */

self.onmessage = function (e) {
    const { maxNumber, rBins, thetaBins } = e.data;

    console.log(`[Worker] Starting Analysis: N=${maxNumber}, Grid=${rBins}x${thetaBins}`);
    const start = performance.now();

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
    const primeCounts = new Int32Array(totalBins);
    const totalCounts = new Int32Array(totalBins); // For "Expected" calculation

    // 3. Binning Loop
    // Sacks Spiral: r = sqrt(n), theta = 2*PI*sqrt(n)
    const maxR = Math.sqrt(maxNumber);
    const PI2 = Math.PI * 2;

    for (let n = 2; n <= maxNumber; n++) {
        const root = Math.sqrt(n);
        const r = root; // Normalized r is r/maxR
        const theta = (root * PI2) % PI2; // 0 to 2PI

        // Map to bins
        let rIdx = Math.floor((r / maxR) * rBins);
        if (rIdx >= rBins) rIdx = rBins - 1;

        let tIdx = Math.floor((theta / PI2) * thetaBins);
        if (tIdx >= thetaBins) tIdx = thetaBins - 1;

        const binIdx = rIdx * thetaBins + tIdx;

        totalCounts[binIdx]++;
        if (primeMap[n]) {
            primeCounts[binIdx]++;
        }
    }

    // 4. Calculate Z-Scores
    const zGrid = new Float32Array(totalBins);
    let maxZ = 0;

    // Average density model: 1/ln(n). 
    // But since we have local totalCounts, we can just use that!
    // Exp = totalCounts * (1 / ln(avgN_in_bin?))
    // Actually simpler: Exp = totalCounts / ln(n_at_radius) ?
    // Or even simpler: The density of primes near N is 1/ln(N).
    // Let's use the local counts as the sample size.
    // BUT totalCounts includes composites. The probability of any integer n being prime is 1/ln(n).
    // So Expected P = Sum(1/ln(k) for k in bin).
    // This is more accurate than totalCounts / ln(mid).

    // Let's do a second pass or integrate calculation?
    // Optimization: Just calculate Exp during the main loop? 
    // ExpSum += 1/Math.log(n).

    // Let's re-loop slightly to compute Z
    // Wait, recalculating sum(1/ln(n)) per bin during loop is better.
    const expCounts = new Float32Array(totalBins);

    // REDO LOOP for single pass efficiency?
    // Actually JS loops are fast enough. Let's do it clean.
    // Creating expCounts array and re-looping n might be slow if we iterate maxNumber again.
    // But we iterate bins (small) vs numbers (large).
    // We already lost the n->bin mapping.

    // Better: Accumulate exp during the first loop.
    // Reset arrays
    primeCounts.fill(0);
    expCounts.fill(0);

    for (let n = 2; n <= maxNumber; n++) {
        const root = Math.sqrt(n);
        const theta = (root * PI2) % PI2;

        let rIdx = Math.floor((root / maxR) * rBins);
        if (rIdx >= rBins) rIdx = rBins - 1;

        let tIdx = Math.floor((theta / PI2) * thetaBins);
        if (tIdx >= thetaBins) tIdx = thetaBins - 1;

        const binIdx = rIdx * thetaBins + tIdx;

        if (primeMap[n]) primeCounts[binIdx]++;
        expCounts[binIdx] += 1.0 / Math.log(n);
    }

    for (let i = 0; i < totalBins; i++) {
        const obs = primeCounts[i];
        const exp = expCounts[i];

        if (exp > 0.5) { // Minimum expected count to avoid div/0 noise
            const z = (obs - exp) / Math.sqrt(exp);
            zGrid[i] = z;
            if (z > maxZ) maxZ = z;
        } else {
            zGrid[i] = 0;
        }
    }

    const time = performance.now() - start;
    console.log(`[Worker] Analysis Complete: MaxZ=${maxZ.toFixed(2)} in ${time.toFixed(0)}ms`);

    self.postMessage({
        type: 'RESULT',
        zGrid: zGrid,
        maxZ: maxZ,
        rBins,
        thetaBins,
        maxR
    }, [zGrid.buffer]); // Transfer buffer
};
