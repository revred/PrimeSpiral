/**
 * HeatmapLayer
 * Renders the Polar Density Grid (Z-Scores).
 * Uses "Sparse Rendering" (only high Z bins) for performance.
 */
class HeatmapLayer {
    constructor(ctx) {
        this.ctx = ctx;
        this.zGrid = null;
        this.maxZ = 0;
        this.rBins = 0;
        this.thetaBins = 0;
        this.maxR = 0;

        this.activeBins = []; // Pre-calculated list of {rVal, tVal, color}
        this.threshold = 3.0;
        this.visible = false;

        // Colors
        this.colWeak = [0, 255, 255]; // Cyan
        this.colStrong = [255, 50, 50]; // Red
    }

    updateData(zGrid, maxZ, rBins, thetaBins, maxR) {
        this.zGrid = zGrid;
        this.maxZ = maxZ;
        this.rBins = rBins;
        this.thetaBins = thetaBins;
        this.maxR = maxR;

        // Auto-Scale Threshold if signal is weak
        if (this.maxZ > 0 && this.maxZ < this.threshold) {
            console.log(`[Heatmap] Signal weak (MaxZ=${maxZ.toFixed(2)}). Lowering threshold to ${maxZ * 0.5}`);
            this.threshold = this.maxZ * 0.5;
        }

        this.rebuildActiveBins();
    }

    setThreshold(val) {
        if (Math.abs(this.threshold - val) > 0.1) {
            this.threshold = val;
            this.rebuildActiveBins();
        }
    }

    rebuildActiveBins() {
        if (!this.zGrid) return;

        this.activeBins = [];
        const PI2 = Math.PI * 2;
        const rStep = this.maxR / this.rBins; // in sqrt(n) units
        const tStep = PI2 / this.thetaBins; // in radians

        for (let r = 0; r < this.rBins; r++) {
            for (let t = 0; t < this.thetaBins; t++) {
                const z = this.zGrid[r * this.thetaBins + t];
                if (z < this.threshold) continue;

                // Calculate Geometry
                // rVal = center radius of bin
                const rVal = (r + 0.5) * rStep;
                const tVal = (t + 0.5) * tStep;

                // Color ramp
                // Z=3 -> 0.2 alpha, Z=8 -> 1.0 alpha
                // Blend Cyan -> Red?
                const intensity = Math.min(1, (z - this.threshold) / 5.0);
                const rCol = Math.floor(0 + intensity * 255);
                const gCol = Math.floor(255 - intensity * 200);
                const bCol = Math.floor(255 - intensity * 200);
                const alpha = 0.3 + intensity * 0.7;

                this.activeBins.push({
                    rVal, // sqrt(n)
                    tVal, // 0..2PI
                    rMin: r * rStep,
                    rMax: (r + 1) * rStep,
                    tMin: t * tStep,
                    tMax: (t + 1) * tStep,
                    color: `rgba(${rCol},${gCol},${bCol},${alpha})`,
                    z
                });
            }
        }
        // console.log(`[Heatmap] Rebuilt. Active Bins: ${this.activeBins.length}`);
    }

    render(scale, centerX, centerY, offsetX, offsetY, spacing, R0, useWarp) {
        if (!this.visible) return;
        if (!this.activeBins.length) {
            // Rate limit logs?
            if (Math.random() < 0.01) console.log("[Heatmap] Render called but no active bins.");
            return;
        }

        const ctx = this.ctx;
        const tx = offsetX + centerX;
        const ty = offsetY + centerY;

        // console.log(`[Heatmap] Rendering ${this.activeBins.length} bins. Ctr(${centerX},${centerY}) Off(${offsetX},${offsetY}) Scale: ${scale}`);

        const PI2 = Math.PI * 2;

        ctx.globalCompositeOperation = 'screen';
        const warp = (r) => (r * r) / (r + R0);

        let drawnCount = 0;

        for (const bin of this.activeBins) {
            const rBase = bin.rVal * spacing;
            const radius = useWarp ? warp(rBase) : rBase;

            // Simple culling
            // if (radius * scale > 5000) continue; // Screen check?

            const startAngle = Math.PI - bin.tMax;
            const endAngle = Math.PI - bin.tMin;

            // Thickness:
            const rInnerBase = bin.rMin * spacing;
            const rOuterBase = bin.rMax * spacing;
            const rInner = (useWarp ? warp(rInnerBase) : rInnerBase) * scale;
            const rOuter = (useWarp ? warp(rOuterBase) : rOuterBase) * scale;

            const thickness = Math.max(1, rOuter - rInner);
            const midR = (rInner + rOuter) / 2;

            // Only draw if visible on screen roughly
            // x = midR * cos(angle) + tx
            // Check if midR + tx is within canvas bounds logic?
            // Skip for now to assume logic is sound

            ctx.beginPath();
            ctx.strokeStyle = bin.color;
            ctx.lineWidth = thickness;
            // Ensure Arc draws strictly the segment
            ctx.arc(tx, ty, midR, startAngle, endAngle, false);
            ctx.stroke();
            drawnCount++;
        }

        // Console log once per second-ish or if it changes drastically? 
        // console.log(`[Heatmap] Drew ${drawnCount} bins.`);

        ctx.globalCompositeOperation = 'source-over';
    }
}
