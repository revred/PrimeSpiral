using Microsoft.JSInterop;
using System;
using System.Collections.Generic;

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

        private static readonly Dictionary<int, List<PointData>> _chunks = new();
        private static readonly Dictionary<int, List<PointData>> _primeChunks = new();

        private static double[] _coordX = Array.Empty<double>();
        private static double[] _coordY = Array.Empty<double>();
        private static int _coordLimit = -1;

        private static double _spacing = 1.0;
        private static double _warpR0 = 120.0;
        private static bool _useWarp = true;

        // Bounds
        private static double _minX, _maxX, _minY, _maxY;

        private static int ToChunkKey(int x, int y) => (y << 16) | (x & 0xFFFF);

        private static void EnsureCoordCapacity(int limit)
        {
            if (_coordX.Length == limit + 1 && _coordY.Length == limit + 1) return;
            _coordX = new double[limit + 1];
            _coordY = new double[limit + 1];
            _coordLimit = limit;
        }

        private static void ComputePoint(int id, out double x, out double y)
        {
            double root = Math.Sqrt(id);
            double theta = root * 2.0 * Math.PI;
            double r = root * _spacing;
            double rw = _useWarp ? (r * r) / (r + _warpR0) : r;

            x = -Math.Cos(theta) * rw;
            y = Math.Sin(theta) * rw;
        }

        private static bool TryGetPoint(int id, out double x, out double y)
        {
            if (id >= 0 && id <= _coordLimit && _coordX.Length > id)
            {
                x = _coordX[id];
                y = _coordY[id];
                return true;
            }

            ComputePoint(id, out x, out y);
            return false;
        }

        [JSInvokable("SetTransform")]
        public static string SetTransform(double spacing, double r0, bool useWarp)
        {
            _spacing = spacing <= 0 ? 1.0 : spacing;
            _warpR0 = r0 <= 0 ? 1.0 : r0;
            _useWarp = useWarp;
            return $"Transform set: spacing={_spacing:F3}, r0={_warpR0:F2}, warp={_useWarp}";
        }

        [JSInvokable("BuildGrid")]
        public static string BuildGrid(int limit)
        {
            try
            {
                _chunks.Clear();
                _primeChunks.Clear();
                _minX = double.MaxValue; _maxX = double.MinValue;
                _minY = double.MaxValue; _maxY = double.MinValue;
                EnsureCoordCapacity(limit);

                byte[] primeMap = PrimeEngine.GeneratePrimeMap(limit);

                for (int i = 0; i <= limit; i++)
                {
                    ComputePoint(i, out double x, out double y);
                    _coordX[i] = x;
                    _coordY[i] = y;

                    if (x < _minX) _minX = x;
                    if (x > _maxX) _maxX = x;
                    if (y < _minY) _minY = y;
                    if (y > _maxY) _maxY = y;

                    int kx = (int)Math.Floor(x / CHUNK_SIZE);
                    int ky = (int)Math.Floor(y / CHUNK_SIZE);
                    int key = ToChunkKey(kx, ky);

                    if (!_chunks.TryGetValue(key, out var chunk))
                    {
                        chunk = new List<PointData>(64);
                        _chunks[key] = chunk;
                    }

                    var p = new PointData { Id = i, X = x, Y = y, IsPrime = primeMap[i] == 1 };
                    chunk.Add(p);

                    if (p.IsPrime)
                    {
                        if (!_primeChunks.TryGetValue(key, out var primeChunk))
                        {
                            primeChunk = new List<PointData>(32);
                            _primeChunks[key] = primeChunk;
                        }
                        primeChunk.Add(p);
                    }
                }
                return $"Success: Built grid with {limit} points. Chunks: {_chunks.Count}. Warp: {_useWarp}";
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
                    int key = ToChunkKey(kx, ky);
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

        private static int[] GetNeighborIdsCore(int centerId, int count)
        {
            if (count <= 0 || centerId < 0 || centerId > _coordLimit) return Array.Empty<int>();

            TryGetPoint(centerId, out double cx, out double cy);
            double searchRadius = 50.0 + (Math.Sqrt(centerId) * 0.5);
            double maxDistSq = searchRadius * searchRadius;

            int minKX = (int)Math.Floor((cx - searchRadius) / CHUNK_SIZE);
            int maxKX = (int)Math.Floor((cx + searchRadius) / CHUNK_SIZE);
            int minKY = (int)Math.Floor((cy - searchRadius) / CHUNK_SIZE);
            int maxKY = (int)Math.Floor((cy + searchRadius) / CHUNK_SIZE);

            var candidates = new List<(int id, double distSq)>(count * 8);

            for (int ky = minKY; ky <= maxKY; ky++)
            {
                for (int kx = minKX; kx <= maxKX; kx++)
                {
                    int key = ToChunkKey(kx, ky);
                    if (!_primeChunks.TryGetValue(key, out var list)) continue;

                    foreach (var p in list)
                    {
                        if (p.Id == centerId) continue;

                        double dx = p.X - cx;
                        double dy = p.Y - cy;
                        double dSq = dx * dx + dy * dy;
                        if (dSq <= maxDistSq)
                        {
                            candidates.Add((p.Id, dSq));
                        }
                    }
                }
            }

            if (candidates.Count == 0) return Array.Empty<int>();

            candidates.Sort((a, b) => a.distSq.CompareTo(b.distSq));

            int take = Math.Min(count, candidates.Count);
            var ids = new int[take];
            for (int i = 0; i < take; i++)
            {
                ids[i] = candidates[i].id;
            }
            return ids;
        }

        [JSInvokable("GetNeighborIds")]
        public static int[] GetNeighborIds(int centerId, int count)
        {
            return GetNeighborIdsCore(centerId, count);
        }

        [JSInvokable("GetNeighborhoodIds")]
        public static int[] GetNeighborhoodIds(double x, double y, double maxDist, int neighborCount)
        {
            int nearestId = GetNearest(x, y, maxDist);
            if (nearestId == -1) return Array.Empty<int>();

            var neighbors = GetNeighborIdsCore(nearestId, neighborCount);
            var result = new int[neighbors.Length + 1];
            result[0] = nearestId;
            if (neighbors.Length > 0)
            {
                Array.Copy(neighbors, 0, result, 1, neighbors.Length);
            }
            return result;
        }

        [JSInvokable("GetNeighbors")]
        public static RenderPoint[] GetNeighbors(int centerId, int count)
        {
            var ids = GetNeighborIdsCore(centerId, count);
            if (ids.Length == 0) return Array.Empty<RenderPoint>();

            var result = new RenderPoint[ids.Length];
            for (int i = 0; i < ids.Length; i++)
            {
                int id = ids[i];
                TryGetPoint(id, out double x, out double y);
                result[i] = new RenderPoint
                {
                    Id = id,
                    X = x,
                    Y = y
                };
            }
            return result;
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

                byte[] primeMap = PrimeEngine.GeneratePrimeMap(maxNumber);

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

                    if (primeMap[n] == 1) primeCounts[binIdx]++;
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
