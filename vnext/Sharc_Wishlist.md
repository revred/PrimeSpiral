# Sharc Feature Wish List (vNext)

To transition from a "high-performance visualization" to a "prime insight engine," the following features in the Sharc DB ecosystem would be transformative:

## 1. Native Vector Indexing & Search (A-NN)
- **Desired**: Support for HNSW (Hierarchical Navigable Small Worlds) or IVF indexing.
- **Why**: Currently, neighborhood searches require a Bounding Box + B-tree scan. A native vector index would allow sub-millisecond KNN searches even as N grows into the multi-millions.

## 2. Graph First-Class Support
- **Desired**: Adjacency list storage and a graph traversal API (e.g., `MATCH (p:Prime)-[:NEIGHBOR]->(n)`).
- **Why**: Primes in a spiral have complex geometric and numerical relationships. Treating them as a graph enables "Shortest Path" discovery between residues or clusters.

## 3. Native Distance Sorting
- **Desired**: Support for `ORDER BY distance(x1, y1, x2, y2)` natively in the query engine.
- **Why**: Sorting 10k results in C# / WASM is fast, but doing it inside the database engine (before results are even materialized) would be faster and more memory-efficient.

## 4. Spatially-Aware Query Planner
- **Desired**: A planner that automatically switches between a B-tree range scan and a grid-based approach based on the query bounding box size.
- **Why**: Small queries are fast with B-trees, but large spatial sweeps would benefit from a more "chunked" internal storage layout.

## 5. Geometric Aggregates
- **Desired**: `SELECT CENTROID(x, y), RADIUS(x, y) FROM primes WHERE ...`.
- **Why**: Allows for rapid analysis of prime clusters and "fibre" density without pulling every individual point into memory.
