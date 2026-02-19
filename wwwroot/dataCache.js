/**
 * Lightweight IndexedDB cache for expensive prime datasets.
 * This keeps startup responsive on repeat visits.
 */
class PrimeDataCache {
    constructor(dbName = "prime_spiral_cache", version = 1) {
        this.dbName = dbName;
        this.version = version;
        this.dbPromise = this.open();
    }

    async open() {
        if (!("indexedDB" in window)) return null;

        return new Promise((resolve) => {
            const req = indexedDB.open(this.dbName, this.version);

            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains("primeMaps")) {
                    const store = db.createObjectStore("primeMaps", { keyPath: "limit" });
                    store.createIndex("updatedAt", "updatedAt", { unique: false });
                }
            };

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => {
                console.warn("[Cache] IndexedDB unavailable:", req.error);
                resolve(null);
            };
        });
    }

    async getPrimeMap(limit) {
        const db = await this.dbPromise;
        if (!db) return null;

        return new Promise((resolve) => {
            const tx = db.transaction("primeMaps", "readonly");
            const store = tx.objectStore("primeMaps");
            const req = store.get(limit);

            req.onsuccess = () => {
                const row = req.result;
                if (!row || !row.buffer) {
                    resolve(null);
                    return;
                }
                resolve(new Uint8Array(row.buffer));
            };
            req.onerror = () => resolve(null);
        });
    }

    async putPrimeMap(limit, primeMap) {
        if (!(primeMap instanceof Uint8Array)) return;

        const db = await this.dbPromise;
        if (!db) return;

        const mapCopy = new Uint8Array(primeMap);

        await new Promise((resolve) => {
            const tx = db.transaction("primeMaps", "readwrite");
            const store = tx.objectStore("primeMaps");
            store.put({
                limit,
                updatedAt: Date.now(),
                buffer: mapCopy.buffer
            });

            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        });

        await this.prunePrimeMaps(3);
    }

    async prunePrimeMaps(maxEntries) {
        const db = await this.dbPromise;
        if (!db || maxEntries < 1) return;

        const rows = await new Promise((resolve) => {
            const tx = db.transaction("primeMaps", "readonly");
            const store = tx.objectStore("primeMaps");
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });

        if (!Array.isArray(rows) || rows.length <= maxEntries) return;

        rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        const stale = rows.slice(maxEntries);
        if (stale.length === 0) return;

        await new Promise((resolve) => {
            const tx = db.transaction("primeMaps", "readwrite");
            const store = tx.objectStore("primeMaps");
            for (const row of stale) {
                store.delete(row.limit);
            }
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
        });
    }
}

window.PrimeDataCache = PrimeDataCache;
window.primeDataCache = new PrimeDataCache();
