// --- Fiber System ---
// Quadratic form: n(k) = k^2 + k + C
// Euler: C=41, Legendre: C=17
class FiberManager {
    constructor() {
        this.fiberMap = null; // Uint8Array: 0=None, 1=Euler, 2=Legendre
        this.fiberConfigs = {
            'EULER': { C: 41, id: 1 },
            'LEGENDRE': { C: 17, id: 2 }
        };
    }

    init(max) {
        this.fiberMap = new Uint8Array(max + 1);
        this.rebuild('EULER');
        this.rebuild('LEGENDRE');
    }

    rebuild(name) {
        if (!this.fiberMap) return;
        const config = this.fiberConfigs[name];
        if (!config) return;
        const C = config.C;
        const id = config.id;
        let k = 0;
        while (true) {
            const n = k * k + k + C;
            if (n >= this.fiberMap.length) break;
            this.fiberMap[n] = id;
            k++;
        }
    }

    isFiber(n, name) {
        if (!this.fiberMap) return false;
        const val = this.fiberMap[n];
        if (val === 0) return false;
        return val === this.fiberConfigs[name].id;
    }
}
window.fiberManager = new FiberManager();
