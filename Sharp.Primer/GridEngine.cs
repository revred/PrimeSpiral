using Microsoft.JSInterop;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sharp.Primer
{
    public class GridEngine
    {
        private const int CHUNK_SIZE = 100;
        
        // Structure to hold point data closely packed
        private struct PointData
        {
            public int Id;
            public double X;
            public double Y;
            public bool IsPrime;
        }

        private static Dictionary<int, List<PointData>> _chunks = new();
        private static Dictionary<int, List<PointData>> _primeChunks = new();
        
        // Bounds
        private static double _minX, _maxX, _minY, _maxY;

        [JSInvokable("BuildGrid")]
        public static string BuildGrid(int limit)
        {
            try
            {
                _chunks.Clear();
                _primeChunks.Clear();
                _minX = double.MaxValue; _maxX = double.MinValue;
                _minY = double.MaxValue; _maxY = double.MinValue;

                // Re-generate locations based on Sacks Spiral Formula
                var primes = PrimeEngine.GeneratePrimes(limit);
                var primeSet = new HashSet<int>(primes);

                for (int i = 0; i <= limit; i++)
                {
                    // Polar to Cartesian
                    double root = Math.Sqrt(i);
                    double theta = root * 2 * Math.PI;
                    double x = root * Math.Cos(theta);
                    double y = -root * Math.Sin(theta); 

                    if (x < _minX) _minX = x;
                    if (x > _maxX) _maxX = x;
                    if (y < _minY) _minY = y;
                    if (y > _maxY) _maxY = y;

                    int kx = (int)Math.Floor(x / CHUNK_SIZE);
                    int ky = (int)Math.Floor(y / CHUNK_SIZE);
                    int key = (ky << 16) | (kx & 0xFFFF);

                    if (!_chunks.ContainsKey(key)) _chunks[key] = new List<PointData>();
                    
                    var p = new PointData { Id = i, X = x, Y = y, IsPrime = primeSet.Contains(i) };
                    _chunks[key].Add(p);

                    if (p.IsPrime)
                    {
                        if (!_primeChunks.ContainsKey(key)) _primeChunks[key] = new List<PointData>();
                        _primeChunks[key].Add(p);
                    }
                }
                return $"Success: Built grid with {limit} points. Chunks: {_chunks.Count}";
            }
            catch (Exception ex)
            {
                return $"Error: {ex.Message} \nStack: {ex.StackTrace}";
            }
        }

        [JSInvokable("GetNearest")]
        public static int GetNearest(double x, double y, double maxDist)
        {
            // Simple spatial query
            // Determine chunks to search
            int minKX = (int)Math.Floor((x - maxDist) / CHUNK_SIZE);
            int maxKX = (int)Math.Floor((x + maxDist) / CHUNK_SIZE);
            int minKY = (int)Math.Floor((y - maxDist) / CHUNK_SIZE);
            int maxKY = (int)Math.Floor((y + maxDist) / CHUNK_SIZE);

            double minDistSq = maxDist * maxDist;
            int nearestId = -1;

            for (int ky = minKY; ky <= maxKY; ky++)
            {
                for (int kx = minKX; kx <= maxKX; kx++)
                {
                    int key = (ky << 16) | (kx & 0xFFFF);
                    if (_primeChunks.TryGetValue(key, out var list))
                    {
                        foreach (var p in list)
                        {
                            double dx = p.X - x;
                            double dy = p.Y - y;
                            double dSq = dx * dx + dy * dy;
                            if (dSq < minDistSq)
                            {
                                minDistSq = dSq;
                                nearestId = p.Id;
                            }
                        }
                    }
                }
            }

            return nearestId;
        }

        public struct RenderPoint
        {
            public int Id { get; set; }
            public double X { get; set; }
            public double Y { get; set; }
        }

        [JSInvokable("GetNeighbors")]
        public static RenderPoint[] GetNeighbors(int centerId, int count)
        {
             // Optimization: Re-calculate X/Y from ID (Sacks Spiral is deterministic!)
            double root = Math.Sqrt(centerId);
            double theta = root * 2 * Math.PI;
            double cx = root * Math.Cos(theta);
            double cy = -root * Math.Sin(theta);
            
            double searchRadius = 50.0 + (root * 0.5); // Heuristic radius
            
            int minKX = (int)Math.Floor((cx - searchRadius) / CHUNK_SIZE);
            int maxKX = (int)Math.Floor((cx + searchRadius) / CHUNK_SIZE);
            int minKY = (int)Math.Floor((cy - searchRadius) / CHUNK_SIZE);
            int maxKY = (int)Math.Floor((cy + searchRadius) / CHUNK_SIZE);

            var neighbors = new List<(int id, double x, double y, double distSq)>();

            for (int ky = minKY; ky <= maxKY; ky++)
            {
                for (int kx = minKX; kx <= maxKX; kx++)
                {
                    int key = (ky << 16) | (kx & 0xFFFF);
                    if (_primeChunks.TryGetValue(key, out var list))
                    {
                        foreach (var p in list)
                        {
                            // Include center in list for rendering? Usually neighbors means *other* points.
                            // But for rendering the "Cluster" we might want the center too.
                            // Let's stick to neighbors exclude center.
                            if (p.Id == centerId) continue;
                            
                            double dx = p.X - cx;
                            double dy = p.Y - cy;
                            double dSq = dx * dx + dy * dy;
                            
                            if (dSq < searchRadius * searchRadius)
                            {
                                neighbors.Add((p.Id, p.X, p.Y, dSq));
                            }
                        }
                    }
                }
            }
            
            // Return top K sorted by distance
            return neighbors.OrderBy(n => n.distSq)
                            .Take(count)
                            .Select(n => new RenderPoint { Id = n.id, X = n.x, Y = n.y })
                            .ToArray();
        }

        [JSInvokable("GetDensityMap")]
        public static float[] GetDensityMap(int maxNumber, int rBins, int thetaBins)
        {
            try
            {
                int totalBins = rBins * thetaBins;
                float[] zGrid = new float[totalBins];
                int[] primeCounts = new int[totalBins];
                float[] expCounts = new float[totalBins];

                // 1. Sieve Primes (Reuse PrimeEngine logic or call it)
                // We need random access check, so a bool array is ideal.
                bool[] isPrime = new bool[maxNumber + 1];
                var primeList = PrimeEngine.GeneratePrimes(maxNumber);
                foreach (var p in primeList) isPrime[p] = true;

                double maxR = Math.Sqrt(maxNumber);
                double PI2 = Math.PI * 2;

                // 2. Binning Loop
                // Start from 2 to avoid log(0) or log(1) issues
                for (int n = 2; n <= maxNumber; n++)
                {
                    double root = Math.Sqrt(n);
                    double theta = (root * PI2) % PI2;
                    if (theta < 0) theta += PI2;

                    // Map to bins
                    int rIdx = (int)((root / maxR) * rBins);
                    if (rIdx >= rBins) rIdx = rBins - 1;

                    int tIdx = (int)((theta / PI2) * thetaBins);
                    if (tIdx >= thetaBins) tIdx = thetaBins - 1;

                    int binIdx = rIdx * thetaBins + tIdx;

                    if (isPrime[n]) primeCounts[binIdx]++;
                    expCounts[binIdx] += (float)(1.0 / Math.Log(n));
                }

                // 3. Calculate Z-Scores
                for (int i = 0; i < totalBins; i++)
                {
                    float obs = primeCounts[i];
                    float exp = expCounts[i];
                    if (exp > 0.001f)
                    {
                        zGrid[i] = (float)((obs - exp) / Math.Sqrt(exp));
                    }
                }

                // 4. Smoothing (Gaussian Kernel along Theta)
                float[] smoothedZ = new float[totalBins];
                for (int r = 0; r < rBins; r++)
                {
                    for (int t = 0; t < thetaBins; t++)
                    {
                        int idx = r * thetaBins + t;

                        int tLeft = (t - 1 + thetaBins) % thetaBins;
                        int tRight = (t + 1) % thetaBins;

                        int idxLeft = r * thetaBins + tLeft;
                        int idxRight = r * thetaBins + tRight;

                        smoothedZ[idx] = zGrid[idx] * 0.5f + zGrid[idxLeft] * 0.25f + zGrid[idxRight] * 0.25f;
                    }
                }

                return smoothedZ;
            }
            catch (Exception)
            {
                // In case of error, return empty array
                return Array.Empty<float>();
            }
        }
        // --- BENCHMARKS ---

        [JSInvokable("BenchmarkGrid")]
        public static string BenchmarkGrid(int limit)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            BuildGrid(limit);
            sw.Stop();
            return $"[Benchmark] BuildGrid({limit}): {sw.Elapsed.TotalMilliseconds:F2} ms. Chunks: {_chunks.Count}";
        }

        [JSInvokable("BenchmarkQuery")]
        public static string BenchmarkQuery(int count, double maxDist)
        {
            if (_chunks.Count == 0) return "Error: Grid not built.";
            
            var rand = new Random(123); // Fixed seed
            double queryRange = 5000; // Arbitrary coordinate range

            var sw = System.Diagnostics.Stopwatch.StartNew();
            int hits = 0;
            
            for(int i=0; i<count; i++)
            {
                double x = (rand.NextDouble() * 2 - 1) * queryRange;
                double y = (rand.NextDouble() * 2 - 1) * queryRange;
                int res = GetNearest(x, y, maxDist);
                if (res != -1) hits++;
            }
            
            sw.Stop();
            double avg = sw.Elapsed.TotalMilliseconds / count;
            return $"[Benchmark] {count} Queries: {sw.Elapsed.TotalMilliseconds:F2} ms (Avg: {avg:F4} ms/op). Hits: {hits}";
        }

        [JSInvokable("BenchmarkDensity")]
        public static string BenchmarkDensity(int maxNumber, int rBins, int thetaBins)
        {
            var sw = System.Diagnostics.Stopwatch.StartNew();
            var map = GetDensityMap(maxNumber, rBins, thetaBins);
            sw.Stop();
            return $"[Benchmark] DensityMap({maxNumber}, {rBins}x{thetaBins}): {sw.Elapsed.TotalMilliseconds:F2} ms. MapSize: {map.Length}";
        }
    }
}
