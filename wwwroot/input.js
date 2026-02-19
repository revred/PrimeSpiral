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

        // Touch State
        this.activeTouches = new Map();
        this.pinchDistance = null;
        this.lastPinchMidpoint = null;
        this.touchMoved = false;
        this.lastTapTime = 0;

        this.bindEvents();
    }

    updateWorldPointer(clientX, clientY) {
        const wp = this.camera.screenToWorld(clientX, clientY);
        this.worldX = wp.x;
        this.worldY = wp.y;
        window.mouseWorldX = wp.x;
        window.mouseWorldY = wp.y;
    }

    getFirstTouch() {
        const iter = this.activeTouches.values().next();
        return iter.done ? null : iter.value;
    }

    handlePinchGesture() {
        if (this.activeTouches.size < 2) return;

        const touches = Array.from(this.activeTouches.values());
        const a = touches[0];
        const b = touches[1];

        const midX = (a.x + b.x) * 0.5;
        const midY = (a.y + b.y) * 0.5;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.hypot(dx, dy);

        this.updateWorldPointer(midX, midY);

        if (this.pinchDistance !== null && dist > 0) {
            let factor = dist / this.pinchDistance;
            if (!Number.isFinite(factor) || factor <= 0) factor = 1;
            factor = Math.max(0.85, Math.min(1.15, factor));
            this.camera.zoomTo(midX, midY, factor);
        }

        if (this.lastPinchMidpoint) {
            this.camera.panBy(midX - this.lastPinchMidpoint.x, midY - this.lastPinchMidpoint.y);
        }

        this.pinchDistance = dist;
        this.lastPinchMidpoint = { x: midX, y: midY };
        this.requestUpdate();
    }

    bindEvents() {
        const c = this.canvas;
        c.style.touchAction = 'none';
        window.isTouchInput = false;

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
            window.isTouchInput = false;
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
            window.isTouchInput = false;
            this.updateWorldPointer(e.clientX, e.clientY);

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

        c.addEventListener('touchstart', (e) => {
            e.preventDefault();
            window.isTouchInput = true;

            for (const touch of e.changedTouches) {
                this.activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
            }

            if (this.activeTouches.size === 1) {
                const t = this.getFirstTouch();
                if (t) {
                    this.lastX = t.x;
                    this.lastY = t.y;
                    this.touchMoved = false;
                    this.updateWorldPointer(t.x, t.y);
                }
            } else if (this.activeTouches.size >= 2) {
                this.handlePinchGesture();
            }

            this.requestUpdate();
        }, { passive: false });

        c.addEventListener('touchmove', (e) => {
            e.preventDefault();
            window.isTouchInput = true;

            for (const touch of e.changedTouches) {
                if (this.activeTouches.has(touch.identifier)) {
                    this.activeTouches.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
                }
            }

            if (this.activeTouches.size >= 2) {
                this.handlePinchGesture();
                return;
            }

            const t = this.getFirstTouch();
            if (!t) return;

            this.updateWorldPointer(t.x, t.y);

            const dx = t.x - this.lastX;
            const dy = t.y - this.lastY;
            if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
                this.touchMoved = true;
                this.camera.panBy(dx, dy);
                this.lastX = t.x;
                this.lastY = t.y;
            }

            this.requestUpdate();
        }, { passive: false });

        const onTouchEnd = (e) => {
            window.isTouchInput = true;

            for (const touch of e.changedTouches) {
                this.activeTouches.delete(touch.identifier);
            }

            if (this.activeTouches.size === 0) {
                this.pinchDistance = null;
                this.lastPinchMidpoint = null;

                const now = Date.now();
                if (!this.touchMoved && now - this.lastTapTime < 320) {
                    this.camera.zoomTo(this.lastX, this.lastY, 1.35);
                    this.requestUpdate();
                }
                this.lastTapTime = now;
                this.touchMoved = false;
            } else if (this.activeTouches.size === 1) {
                const t = this.getFirstTouch();
                if (t) {
                    this.lastX = t.x;
                    this.lastY = t.y;
                    this.updateWorldPointer(t.x, t.y);
                }
                this.pinchDistance = null;
                this.lastPinchMidpoint = null;
            }

            this.requestUpdate();
        };

        c.addEventListener('touchend', onTouchEnd, { passive: true });
        c.addEventListener('touchcancel', onTouchEnd, { passive: true });

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
