/**
 * Camera System
 * Handles View State (Scale, Offset) and Smooth Interpolation.
 * Decouples "Physical State" (where we are) from "Render State" (what we see, e.g. Stability wobbles).
 */
class Camera {
    constructor(centerX, centerY) {
        this.scale = 15;
        this.offsetX = 0;
        this.offsetY = 0;

        this.centerX = centerX;
        this.centerY = centerY;

        this.targetScale = 15;
        this.targetOffsetX = 0;
        this.targetOffsetY = 0;

        // Stability / Effects
        this.renderScale = 15;
        this.renderOffset = { x: 0, y: 0 };
    }

    resize(w, h) {
        this.centerX = w / 2;
        this.centerY = h / 2;
        // Keep visual center stable? For now just update center.
    }

    // Convert Screen (Pixels) to World (Units)
    screenToWorld(sx, sy) {
        return {
            x: (sx - this.centerX - this.offsetX) / this.scale,
            y: (sy - this.centerY - this.offsetY) / this.scale
        };
    }

    // Convert World (Units) to Screen (Pixels)
    worldToScreen(wx, wy) {
        return {
            x: wx * this.scale + this.centerX + this.offsetX,
            y: wy * this.scale + this.centerY + this.offsetY
        };
    }

    zoomBy(factor) {
        this.targetScale *= factor;
        this.targetScale = Math.max(0.005, Math.min(500, this.targetScale));
    }

    zoomTo(screenX, screenY, factor) {
        // Pivot Zoom Logic
        // 1. Get World pointing under mouse (using CURRENT visual state)
        const wp = this.screenToWorld(screenX, screenY);

        // 2. Update Target Scale
        this.targetScale *= factor;
        this.targetScale = Math.max(0.005, Math.min(500, this.targetScale));

        // 3. Adjust Target Offset to keep World point matches Screen point
        // Screen = World * TargetScale + Center + TargetOffset
        // TargetOffset = Screen - Center - World * TargetScale
        this.targetOffsetX = (screenX - this.centerX) - (wp.x * this.targetScale);
        this.targetOffsetY = (screenY - this.centerY) - (wp.y * this.targetScale);
    }

    panBy(dx, dy) {
        this.targetOffsetX += dx;
        this.targetOffsetY += dy;
    }

    update() {
        const lerp = (a, b, f) => a + (b - a) * f;

        this.scale = lerp(this.scale, this.targetScale, 0.2);
        this.offsetX = lerp(this.offsetX, this.targetOffsetX, 0.2);
        this.offsetY = lerp(this.offsetY, this.targetOffsetY, 0.2);

        // Update Render State (Default to Physics)
        this.renderScale = this.scale;
        this.renderOffset.x = this.offsetX;
        this.renderOffset.y = this.offsetY;

        // Check for movement (epsilon)
        const active = (
            Math.abs(this.scale - this.targetScale) > 0.0001 ||
            Math.abs(this.offsetX - this.targetOffsetX) > 0.1 ||
            Math.abs(this.offsetY - this.targetOffsetY) > 0.1
        );
        return active;
    }

    // Apply stability or shake effects WITHOUT modifying persistent state
    applyEffect(type, magnitude) {
        const time = Date.now() / 200;
        const wave = Math.sin(time);

        if (type === 'SCALE') {
            this.renderScale = this.scale * (1 + wave * magnitude);
        } else if (type === 'PHASE') {
            // Not implemented in grid yet
        } else if (type === 'WARP') {
            // Visual flicker on scale as placeholder
            this.renderScale = this.scale * (1 + wave * magnitude);
        }
    }
}
