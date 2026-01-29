/**
 * FibreDetector
 * Implements "Fibre Theory V2" extraction logic.
 * 
 * - Step D: Fibre Extraction (Top-K)
 * - Step E: Persistence Filter
 * 
 * Input: Z-Score Grid from Analysis Worker
 * Output: List of Detected Fibres
 */
class FibreDetector {
    constructor() {
        this.zMin = 0.5; // EXTREME DEBUG: Noise floor. Anything > 0.5 is kept.
        this.pMin = 0.10; // 10% persistence
        this.minStrength = 1.0;
        this.topK = 100;
    }

    /**
     * Process a Z-Grid to find fibres.
     * @param {Float32Array} zGrid - Row-major [r * thetaBins + t]
     * @param {number} rBins 
     * @param {number} thetaBins 
     */
    process(zGrid, rBins, thetaBins) {
        console.time("FibreDetection");

        // 1. Build Angular Profile (Outer Rim Only)
        // We only care about fibres starting at the edge.
        // Sum active Z-scores in the outer 20% of the radius.
        const angularProfile = new Float32Array(thetaBins);
        const rStart = Math.floor(rBins * 0.8); // Top 20%
        let maxObservedZ = 0;

        for (let t = 0; t < thetaBins; t++) {
            let strength = 0;
            for (let r = rStart; r < rBins; r++) {
                const idx = r * thetaBins + t;
                const z = zGrid[idx];
                if (z > maxObservedZ) maxObservedZ = z;

                if (z > this.zMin) {
                    strength += (z - this.zMin);
                }
            }
            angularProfile[t] = strength;
        }

        // 2. Smooth the Profile
        const smoothedProfile = this.smooth1D(angularProfile, thetaBins);

        // 3. Find Seeds (Peaks in Outer Rim)
        const fibres = [];
        const minProfileStrength = 1.0;

        for (let t = 0; t < thetaBins; t++) {
            const val = smoothedProfile[t];
            if (val < minProfileStrength) continue;

            const tLeft = (t - 1 + thetaBins) % thetaBins;
            const tRight = (t + 1) % thetaBins;
            const vLeft = smoothedProfile[tLeft];
            const vRight = smoothedProfile[tRight];

            if (val >= vLeft && val >= vRight) {
                // Peak found. Calculate sub-bin theta.
                let offset = 0;
                const denominator = vRight - 2 * val + vLeft;
                if (Math.abs(denominator) > 0.0001) {
                    offset = -0.5 * (vRight - vLeft) / denominator;
                }
                if (offset < -0.7 || offset > 0.7) offset = 0;

                const startThetaBin = t + offset;
                const exactThetaRad = (startThetaBin / thetaBins) * Math.PI * 2;

                fibres.push({
                    thetaBin: startThetaBin,
                    thetaRad: exactThetaRad,
                    strength: val,
                    path: []
                });
            }
        }

        // 4. Sort by Strength
        fibres.sort((a, b) => b.strength - a.strength);
        const topFibres = fibres.slice(0, this.topK);

        // 5. Trace Inwards
        for (const f of topFibres) {
            f.path = this.tracePathInward(zGrid, rBins, thetaBins, f.thetaBin);
        }

        console.timeEnd("FibreDetection");
        console.log(`[Detector] Extracted ${topFibres.length} fibres (Outer-Inward).`);
        return topFibres;
    }

    /**
     * Traces strictly inwards from the outer rim.
     * Prevents loops and enforces "Legendre" flow.
     * FLEXIBLE CORE: Low momentum for turning, High smoothing for structure.
     */
    tracePathInward(zGrid, rBins, thetaBins, startThetaBin) {
        const path = [];
        let currentThetaBin = startThetaBin;
        let momentum = 0; // Angular velocity (dTheta/dr)

        // Constants - FLEXIBLE TUNING
        // Standard window to see the curve.
        const baseWindow = Math.max(3, Math.floor(thetaBins / 60));
        const sigma = baseWindow * 0.5; // Gaussian width
        const sigmaSq2 = 2 * sigma * sigma;

        const MAX_MISSES = 60;
        let consecutiveMisses = 0;

        // Start from the very edge
        for (let r = rBins - 1; r >= 0; r--) {
            // A. Predict next theta
            let centerT = currentThetaBin + momentum;

            // B. Weighted Search (Gravity)
            let maxScore = -Infinity;
            let bestT = centerT;
            let bestZ = 0;

            for (let offset = -baseWindow; offset <= baseWindow; offset++) {
                const t = Math.round(centerT + offset);
                const tIdx = (t % thetaBins + thetaBins) % thetaBins;
                const z = zGrid[r * thetaBins + tIdx];

                // Gaussian Weight
                const dist = offset;
                const weight = Math.exp(-(dist * dist) / sigmaSq2);

                const score = z * weight;

                if (score > maxScore) {
                    maxScore = score;
                    bestT = t;
                    bestZ = z;
                }
            }

            // C. Update State
            if (bestZ < this.zMin * 0.3) {
                // Miss
                consecutiveMisses++;
                if (consecutiveMisses > MAX_MISSES) break;

                // Coast: Follow momentum
                currentThetaBin += momentum;

                const rNorm = r / rBins;
                let thetaRad = (currentThetaBin / thetaBins) * Math.PI * 2;
                thetaRad = (thetaRad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                path.push({ rNorm, thetaRad });

            } else {
                // Hit
                consecutiveMisses = 0;

                // Sub-bin refinement
                const tIdx = (Math.round(bestT) % thetaBins + thetaBins) % thetaBins;
                const tL = (tIdx - 1 + thetaBins) % thetaBins;
                const tR = (tIdx + 1) % thetaBins;
                const zL = zGrid[r * thetaBins + tL];
                const zR = zGrid[r * thetaBins + tR];

                let subOffset = 0;
                const denom = zR - 2 * bestZ + zL;
                if (Math.abs(denom) > 0.0001) subOffset = -0.5 * (zR - zL) / denom;
                if (subOffset < -0.7 || subOffset > 0.7) subOffset = 0;

                const refinedT = Math.round(bestT) + subOffset;

                // Update Momentum (FLEXIBLE TUNING)
                // 85% History, 15% New Observation.
                // Allows sharp turning.
                const dTheta = refinedT - currentThetaBin;
                momentum = momentum * 0.85 + dTheta * 0.15;

                currentThetaBin = refinedT;

                // Add to path
                const rNorm = r / rBins;
                let thetaRad = (currentThetaBin / thetaBins) * Math.PI * 2;
                thetaRad = (thetaRad % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
                path.push({ rNorm, thetaRad });
            }
        }

        return this.smoothPath(path);
    }

    /**
     * Traces strictly inwards from the outer rim.
     * Prevents loops and enforces "Legendre" flow.
     * FLEXIBLE CORE: Low momentum for turning, High smoothing for structure.
     */
    smoothPath(path) {
        if (path.length < 5) return path;
        const smoothed = [];
        // STRUCTURAL SMOOTHING (High Window)
        // Removes the wobble introduced by low momentum.
        const windowSize = 40;
        const half = Math.floor(windowSize / 2);

        for (let i = 0; i < path.length; i++) {
            let sumSin = 0;
            let sumCos = 0;
            let count = 0;

            for (let j = -half; j <= half; j++) {
                if (i + j >= 0 && i + j < path.length) {
                    const angle = path[i + j].thetaRad;
                    sumSin += Math.sin(angle);
                    sumCos += Math.cos(angle);
                    count++;
                }
            }

            const avgAngle = Math.atan2(sumSin / count, sumCos / count);
            smoothed.push({
                rNorm: path[i].rNorm,
                thetaRad: avgAngle
            });
        }
        return smoothed;
    }

    smooth1D(data, len) {
        const output = new Float32Array(len);
        // Kernel: [0.1, 0.2, 0.4, 0.2, 0.1] - approx Gaussian sigma=1
        const k = [0.1, 0.2, 0.4, 0.2, 0.1];
        const half = 2;

        for (let i = 0; i < len; i++) {
            let sum = 0;
            for (let j = -half; j <= half; j++) {
                const idx = (i + j + len) % len;
                sum += data[idx] * k[j + half];
            }
            output[i] = sum;
        }
        return output;
    }

    // Legacy NMS removed as we do Peak Finding directly
    applyNMS(sortedList, thetaBins, limit) { return sortedList; }
}
