/**
 * Deterministic RNG (Linear Congruential Generator)
 * Ensures that visual artifacts (like random colors or particles) are repeatable.
 */
class RNG {
    constructor(seed = 12345) {
        this.m = 0x80000000; // 2^31
        this.a = 1103515245;
        this.c = 12345;
        this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
    }

    nextInt() {
        this.state = (this.a * this.state + this.c) % this.m;
        return this.state;
    }

    // Returns float [0, 1)
    nextFloat() {
        return this.nextInt() / (this.m - 1);
    }

    // Returns int [min, max]
    nextRange(min, max) {
        return min + Math.floor(this.nextFloat() * (max - min + 1));
    }
}

// Global instance
window.RNG = new RNG(888); // Fixed seed for persistence
