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
        console.log(`[Heatmap] Rebuilt. Active Bins: ${this.activeBins.length} (Threshold: ${this.threshold})`);
    }

    render(scale, centerX, centerY, offsetX, offsetY, spacing, R0, useWarp) {
        if (!this.visible || !this.activeBins.length) return;

        const ctx = this.ctx;
        const tx = offsetX + centerX;
        const ty = offsetY + centerY;

        // Batch by color? No, pre-baked strings.
        // Optimization: screen bounds check?
        // rVal * spacing * scale is screen radius approx.

        const PI2 = Math.PI * 2;

        // We draw ARC SEGMENTS.
        // Screen X = -cos(theta) * radius
        // Screen Y = sin(theta) * radius
        // radius = warpR(rVal * spacing)

        // Optimization: Use lineWidth for radial thickness?
        // Arc length: tMin to tMax.

        ctx.globalCompositeOperation = 'screen';

        const warp = (r) => (r * r) / (r + R0);

        for (const bin of this.activeBins) {
            const rBase = bin.rVal * spacing;
            const radius = useWarp ? warp(rBase) : rBase;

            // Check bounds roughly
            // If radius * scale is massive or tiny?

            const alpha = bin.tVal; // theta is actually related to r in Sacks, but here it's Polar Grid theta.
            // Wait. The Worker computed Theta as (root * 2PI) % 2PI.
            // This is the Polar Angle in the Sacks embedding.
            // So we draw at angle bin.tVal.

            // Mapping:
            // X = -cos(theta) * radius
            // Y = sin(theta) * radius
            // Canvas arc uses (x,y, radius, startAngle, endAngle).
            // startAngle = -PI (for cos) + bin.tMin ??
            // Sacks def: x = -cos(t), y = sin(t). 
            // Canvas arc reference: 0 is +X, PI/2 is +Y.
            // x = r cos(A), y = r sin(A).
            // We have -cos(t) = cos(PI-t)? No. cos(t + PI).
            // y = sin(t).
            // So CanvasAngle = PI - t ? Or t + PI?
            // cos(PI+t) = -cos(t). sin(PI+t) = -sin(t). NO.
            // angle = PI - t.
            // cos(PI-t) = -cos(t). sin(PI-t) = sin(t). YES.

            const startAngle = Math.PI - bin.tMax;
            const endAngle = Math.PI - bin.tMin;

            // Note: tMax > tMin, so start < end? Or winding?
            // PI - tMax is SMALLER than PI - tMin.
            // counterclockwise: false.

            // Thickness:
            const rInnerBase = bin.rMin * spacing;
            const rOuterBase = bin.rMax * spacing;
            const rInner = (useWarp ? warp(rInnerBase) : rInnerBase) * scale;
            const rOuter = (useWarp ? warp(rOuterBase) : rOuterBase) * scale;

            const thickness = Math.max(1, rOuter - rInner);
            const midR = (rInner + rOuter) / 2;

            ctx.beginPath();
            ctx.strokeStyle = bin.color;
            ctx.lineWidth = thickness;
            // Ensure Arc draws strictly the segment
            ctx.arc(tx, ty, midR, startAngle, endAngle, false);
            ctx.stroke();
        }

        ctx.globalCompositeOperation = 'source-over';
    }
}
