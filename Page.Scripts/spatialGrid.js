/**
 * SPATIAL GRID
 * Isolated for independent profiling and modularity.
 */

const CHUNK_SIZE = 100;

class SpiralGrid {
    constructor() {
        this.chunks = new Map();
        this.primeChunks = new Map();
        this.minX = 0; this.maxX = 0;
        this.minY = 0; this.maxY = 0;
    }

    clear() {
        this.chunks.clear();
        this.primeChunks.clear();
    }

    get bounds() {
        return {
            minX: this.minX,
            maxX: this.maxX,
            minY: this.minY,
            maxY: this.maxY
        };
    }

    build() {
        this.clear();
        const tempBuffer = new Map();
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        // Start construction from minNumber to respect Hollow Center
        // Global maxNumber/minNumber/cacheX/cacheY/primeMap are expected to be available
        for (let i = minNumber; i <= maxNumber; i++) {
            const x = cacheX[i];
            const y = cacheY[i];

            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;

            const kx = Math.floor(x / CHUNK_SIZE);
            const ky = Math.floor(y / CHUNK_SIZE);
            const key = (ky << 16) | (kx & 0xFFFF);

            let list = tempBuffer.get(key);
            if (!list) {
                list = [];
                tempBuffer.set(key, list);
            }
            list.push(i);
        }

        this.minX = minX; this.maxX = maxX;
        this.minY = minY; this.maxY = maxY;

        for (const [key, list] of tempBuffer) {
            this.chunks.set(key, new Int32Array(list));

            // Filter for Primes Only
            const pList = [];
            for (let id of list) {
                if (primeMap[id]) pList.push(id);
            }
            if (pList.length > 0) this.primeChunks.set(key, new Int32Array(pList));
        }
    }

    query(rLeft, rTop, rRight, rBottom) {
        const startKX = Math.floor(rLeft / CHUNK_SIZE);
        const endKX = Math.floor(rRight / CHUNK_SIZE);
        const startKY = Math.floor(rTop / CHUNK_SIZE);
        const endKY = Math.floor(rBottom / CHUNK_SIZE);

        const results = [];
        let totalPoints = 0;

        for (let ky = startKY; ky <= endKY; ky++) {
            for (let kx = startKX; kx <= endKX; kx++) {
                const key = (ky << 16) | (kx & 0xFFFF);
                const chunk = this.chunks.get(key);
                if (chunk) {
                    results.push(chunk);
                    totalPoints += chunk.length;
                }
            }
        }
        return { chunks: results, count: totalPoints };
    }

    queryPrimes(rLeft, rTop, rRight, rBottom) {
        const startKX = Math.floor(rLeft / CHUNK_SIZE);
        const endKX = Math.floor(rRight / CHUNK_SIZE);
        const startKY = Math.floor(rTop / CHUNK_SIZE);
        const endKY = Math.floor(rBottom / CHUNK_SIZE);

        const results = [];
        let totalPoints = 0;

        for (let ky = startKY; ky <= endKY; ky++) {
            for (let kx = startKX; kx <= endKX; kx++) {
                const key = (ky << 16) | (kx & 0xFFFF);
                const chunk = this.primeChunks.get(key);
                if (chunk) {
                    results.push(chunk);
                    totalPoints += chunk.length;
                }
            }
        }
        return { chunks: results, count: totalPoints };
    }
}
