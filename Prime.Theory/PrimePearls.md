# Prime Pearls Theory

## The Core Concept
Imagine the prime numbers as **Pearls** strung along the infinite number line.

### The Spring Constant (Composite Gaps)
Each Pearl is separated from its neighbors by a **Spring** made of composite numbers.
*   **Gap Size**: The "tension" or length of the spring is determined by the gap between consecutive primes ($g_n = p_{n+1} - p_n$).
*   **Behavior**: As numbers get larger, the average gap size increases (Prime Number Theorem), meaning the "springs" holding the pearls apart generally become larger and more powerful.

## Spiral Interaction and Coils
The number line is not straight; it is coiled into a spiral (e.g., Ulam, Sacks, or Archimedean).
*   **Coiling**: This coiling allows Pearls that are far apart linearily (high index difference) to be close spatially (low geometric distance).
*   **Inter-coil Forces**: Fibres and patterns emerge from the interaction between adjacent coils. A Pearl on coil $C$ might align with a Pearl on coil $C-1$ or $C+1$, creating "Pearl Concentration Fields".

## K-Neighbourhood
To understand the local structure of the Prime Spiral, we define the **K-Neighbourhood** of a Pearl.
*   It consists of the $K$ closest Pearls in 2D space, distinct from linear neighbors.
*   Analyzing this neighborhood helps visualize local density and potential alignments (fibres).

## Visualization
*   **Focus**: The Pearl closest to the observer (mouse cursor) is the anchor.
*   **Springs**: Visual representation of the composite gaps preceding and succeeding the anchor Pearl.
*   **Fields**: Highlighting the K visible spatial neighbors to reveal the local structure.

## Technical Implementation

### Mouse Hover Logic (`InputHandler`)
The interaction is driven by the `InputHandler` class in `Page.Scripts/input.js` (and the callback in `spiral.js`).
*   **Event Loop**: Tracks mouse coordinates in World Space (`wx`, `wy`).
*   **Search Strategy**:
    1.  **Grid Query**: Efficiently retrieves candidate primes from the `SpiralGrid` (spatial hash) near the cursor.
    2.  **Euclidean Distance**: Calculates the squared distance to find the `nearest` candidate.
    3.  **Thresholding**: Applied a `SNAP_DIST` of **50px** (adjusted for zoom scale) to determine if the cursor is "hovering" the prime.

### Density Culling
To prevent visual clutter in dense regions (outer spiral), a density check is applied:
*   **Criterion**: If the distance between $P_n$ and $P_{n-1}$ (or $P_{n+1}$) is less than `PEARL_THRESHOLD` (approx 15px), the Pearl is considered "too dense" and is not rendered.
*   **Result**: Pearls only physically appear when the viewer zooms in enough to resolve the individual points.

### K-Nearest Neighbors & Angular Filtering
Once a Pearl is selected (`hoveredPrime`), we perform a secondary search for its spatial neighbors:
*   **Algorithm**:
    1.  Query a larger radius around the `hoveredPrime`.
    2.  Sort neighbors by distance.
    3.  **Angular Filter**: Iterate through sorted neighbors and accept them only if their angle (relative to the center) differs by at least `ANG_THRESHOLD` (~15 degrees) from all previously accepted neighbors.
    4.  **Star Topology**: Draws connection lines to these $K$ filtered neighbors to visualize the "Field".

### Shift Key Interaction
*   **Labels**: Numeric values for the Prime and its neighbors are hidden by default to maintain aesthetic minimalism.
*   **Trigger**: Holding the **Shift** key reveals the geometric index (prime value) of the Pearl and its connected network.

![Prime Pearls Verification](images/pearl_verification.png)
