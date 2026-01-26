/**
 * Input System
 * Handles Mouse, Touch, and Resize events.
 * Translates raw events into Camera commands.
 */
class InputHandler {
    constructor(canvas, camera, onRedraw) {
        this.canvas = canvas;
        this.camera = camera;
        this.onRedraw = onRedraw;

        this.isDragging = false;
        this.lastX = 0;
        this.lastY = 0;

        // Mouse World Position (Exposed for tooltip logic)
        this.worldX = 0;
        this.worldY = 0;

        this.bindEvents();
    }

    bindEvents() {
        const c = this.canvas;

        // Wheel (Zoom)
        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const zoomIntensity = 0.15;
            const direction = e.deltaY < 0 ? 1 : -1;
            const factor = Math.exp(direction * zoomIntensity);

            this.camera.zoomTo(e.clientX, e.clientY, factor);
            this.requestUpdate();
        }, { passive: false });

        // Drag (Pan)
        c.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            this.lastX = e.clientX;
            this.lastY = e.clientY;
            c.style.cursor = 'grabbing';
        });

        window.addEventListener('mouseup', () => {
            this.isDragging = false;
            c.style.cursor = 'crosshair';
        });

        window.addEventListener('mousemove', (e) => {
            const wp = this.camera.screenToWorld(e.clientX, e.clientY);
            this.worldX = wp.x;
            this.worldY = wp.y;

            // Expose for external tooltip logic
            window.mouseWorldX = wp.x;
            window.mouseWorldY = wp.y;

            if (this.isDragging) {
                const dx = e.clientX - this.lastX;
                const dy = e.clientY - this.lastY;
                this.camera.panBy(dx, dy);
                this.lastX = e.clientX;
                this.lastY = e.clientY;
                this.requestUpdate();
            } else {
                // Hover event
                this.requestUpdate();
            }
        });

        // Resize
        window.addEventListener('resize', () => this.handleResize());
    }

    handleResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.resize(w, h); // Updates center
        this.requestUpdate();
    }

    requestUpdate() {
        if (this.onRedraw) this.onRedraw();
    }
}
