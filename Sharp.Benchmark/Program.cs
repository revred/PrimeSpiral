using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using Sharc;
using Sharc.Core;
using Sharc.Core.Query;

namespace Sharp.Benchmark
{
    class Program
    {
        const int MAX_NUMBER = 2000000;
        const int CHUNK_SIZE = 100;
        const double SPACING = 1.0;

        // Data Stores
        static byte[] primeMap = new byte[MAX_NUMBER + 1];
        static float[] cacheX = new float[MAX_NUMBER + 1];
        static float[] cacheY = new float[MAX_NUMBER + 1];

        // Spatial Grid
        static Dictionary<int, List<int>> gridChunks = new Dictionary<int, List<int>>();

        // Sharc database for benchmarks
        static SharcDatabase? sharcDb;

        class TestResult
        {
            public string Category { get; set; } = "";
            public string TestName { get; set; } = "";
            public double DurationMs { get; set; }
            public double LimitMs { get; set; }
            public bool Passed => DurationMs <= LimitMs;
        }

        static int Main(string[] args)
        {
            var results = new List<TestResult>();

            Console.WriteLine($"Running Benchmarks on {Environment.OSVersion}...");

            // 1. Sieve
            results.Add(new TestResult
            {
                Category = "Algorithm",
                TestName = "Sieve (2M Primes)",
                DurationMs = BenchmarkSieve(),
                LimitMs = 20.0
            });

            // 2. Coordinates
            results.Add(new TestResult
            {
                Category = "Math",
                TestName = "Coordinate Pre-calc",
                DurationMs = BenchmarkCoordinates(),
                LimitMs = 100.0
            });

            // 3. Spatial Grid
            results.Add(new TestResult
            {
                Category = "Data Structure",
                TestName = "Spatial Grid Build",
                DurationMs = BenchmarkSpatialGrid(),
                LimitMs = 100.0
            });

            // 4. Query
            results.Add(new TestResult
            {
                Category = "Query",
                TestName = "Frustum Cull (View)",
                DurationMs = BenchmarkQuery(),
                LimitMs = 0.05
            });

            // 5. Sharc DB Create + Populate
            results.Add(new TestResult
            {
                Category = "Sharc",
                TestName = "DB Create + Insert",
                DurationMs = BenchmarkSharcCreate(),
                LimitMs = 2000.0
            });

            // 6. Sharc Point Lookup
            results.Add(new TestResult
            {
                Category = "Sharc",
                TestName = "B-tree Seek (10K)",
                DurationMs = BenchmarkSharcSeek(),
                LimitMs = 50.0
            });

            // 7. Sharc Spatial Query
            results.Add(new TestResult
            {
                Category = "Sharc",
                TestName = "Spatial BBox (10x)",
                DurationMs = BenchmarkSharcRangeQuery(),
                LimitMs = 5000.0
            });

            // Print Grid
            PrintGrid(results);

            // Clean up Sharc
            sharcDb?.Dispose();

            return results.All(r => r.Passed) ? 0 : 1;
        }

        static void PrintGrid(List<TestResult> results)
        {
            Console.WriteLine();
            Console.WriteLine("=================================================================================");
            Console.WriteLine("| {0,-15} | {1,-25} | {2,10} | {3,10} | {4,-6} |", "CATEGORY", "TEST NAME", "TIME (ms)", "LIMIT (ms)", "STATUS");
            Console.WriteLine("|-----------------|---------------------------|------------|------------|--------|");

            foreach (var r in results)
            {
                string status = r.Passed ? "PASS" : "FAIL";
                Console.ForegroundColor = r.Passed ? ConsoleColor.Green : ConsoleColor.Red;
                Console.WriteLine("| {0,-15} | {1,-25} | {2,10:F3} | {3,10:F3} | {4,-6} |", 
                    r.Category, r.TestName, r.DurationMs, r.LimitMs, status);
                Console.ResetColor();
            }
            Console.WriteLine("=================================================================================");
            Console.WriteLine();
        }

        static double BenchmarkSieve()
        {
            Stopwatch sw = Stopwatch.StartNew();
            for (int i = 0; i <= MAX_NUMBER; i++) primeMap[i] = 1;
            primeMap[0] = 0; primeMap[1] = 0;
            for (int i = 2; i * i <= MAX_NUMBER; i++)
            {
                if (primeMap[i] == 1)
                {
                    for (int j = i * i; j <= MAX_NUMBER; j += i) primeMap[j] = 0;
                }
            }
            sw.Stop();
            return sw.Elapsed.TotalMilliseconds;
        }

        static double BenchmarkCoordinates()
        {
            Stopwatch sw = Stopwatch.StartNew();
            double PI2 = Math.PI * 2;
            for (int i = 0; i <= MAX_NUMBER; i++)
            {
                double root = Math.Sqrt(i);
                double r = root * SPACING;
                double theta = root * PI2;
                cacheX[i] = (float)(-Math.Cos(theta) * r);
                cacheY[i] = (float)(Math.Sin(theta) * r);
            }
            sw.Stop();
            return sw.Elapsed.TotalMilliseconds;
        }

        static double BenchmarkSpatialGrid()
        {
            Stopwatch sw = Stopwatch.StartNew();
            gridChunks.Clear();
            for (int i = 0; i <= MAX_NUMBER; i++)
            {
                int kx = (int)Math.Floor(cacheX[i] / CHUNK_SIZE);
                int ky = (int)Math.Floor(cacheY[i] / CHUNK_SIZE);
                int key = (ky << 16) | (kx & 0xFFFF);

                if (!gridChunks.ContainsKey(key)) gridChunks[key] = new List<int>();
                gridChunks[key].Add(i);
            }
            sw.Stop();
            return sw.Elapsed.TotalMilliseconds;
        }

        static double BenchmarkQuery()
        {
            Stopwatch sw = Stopwatch.StartNew();
            int visibleCount = 0;
            for (int ky = -5; ky <= 5; ky++)
            {
                for (int kx = -5; kx <= 5; kx++)
                {
                    int key = (ky << 16) | (kx & 0xFFFF);
                    if (gridChunks.ContainsKey(key)) visibleCount += gridChunks[key].Count;
                }
            }
            sw.Stop();
            return sw.Elapsed.TotalMilliseconds;
        }

        static double BenchmarkSharcCreate()
        {
            string tmpPath = Path.Combine(Path.GetTempPath(), $"prime_bench_{Guid.NewGuid():N}.db");
            try
            {
                Stopwatch sw = Stopwatch.StartNew();

                // Create database
                var db = SharcDatabase.Create(tmpPath);
                var writer = SharcWriter.From(db);

                // DDL
                using (var tx = writer.BeginTransaction())
                {
                    tx.Execute("CREATE TABLE primes (n INTEGER PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL)");
                    tx.Commit();
                }

                // Bulk insert all primes with coordinates
                double warpR0 = 120.0;
                var records = new List<ColumnValue[]>();
                for (int n = 2; n <= MAX_NUMBER; n++)
                {
                    if (primeMap[n] != 1) continue;
                    double root = Math.Sqrt(n);
                    double theta = root * 2.0 * Math.PI;
                    double r = root * SPACING;
                    double rw = (r * r) / (r + warpR0);
                    double x = -Math.Cos(theta) * rw;
                    double y = Math.Sin(theta) * rw;
                    records.Add(new ColumnValue[] { (long)n, x, y });
                }

                writer.InsertBatch("primes", records);

                sw.Stop();
                double ms = sw.Elapsed.TotalMilliseconds;

                // Keep DB open for subsequent benchmarks (re-open from memory)
                db.Dispose();
                writer.Dispose();
                byte[] bytes = File.ReadAllBytes(tmpPath);
                sharcDb = SharcDatabase.OpenMemory(bytes);

                Console.WriteLine($"  Sharc: {records.Count} primes, {bytes.Length / 1024}KB DB, {ms:F1}ms");
                return ms;
            }
            finally
            {
                try { File.Delete(tmpPath); } catch { }
            }
        }

        static double BenchmarkSharcSeek()
        {
            if (sharcDb == null) return -1;

            var rand = new Random(42);
            int iterations = 10000;

            // Warm up
            using (var warmup = sharcDb.CreateReader("primes", "n"))
            {
                for (int i = 0; i < 100; i++)
                    warmup.Seek(rand.Next(2, MAX_NUMBER));
            }

            Stopwatch sw = Stopwatch.StartNew();
            int hits = 0;
            using (var reader = sharcDb.CreateReader("primes", "n"))
            {
                for (int i = 0; i < iterations; i++)
                {
                    if (reader.Seek(rand.Next(2, MAX_NUMBER)))
                        hits++;
                }
            }
            sw.Stop();

            double avgNs = sw.Elapsed.TotalMilliseconds * 1_000_000.0 / iterations;
            Console.WriteLine($"  Sharc Seek: {avgNs:F0}ns avg, {hits}/{iterations} hits");
            return sw.Elapsed.TotalMilliseconds;
        }

        static double BenchmarkSharcRangeQuery()
        {
            if (sharcDb == null) return -1;

            // Spatial bounding-box query on x/y columns using SharcFilter
            // This demonstrates column-level filtering on real (REAL) columns.
            var filters = new SharcFilter[]
            {
                new("x", SharcOperator.GreaterOrEqual, -100.0),
                new("x", SharcOperator.LessOrEqual, 100.0),
                new("y", SharcOperator.GreaterOrEqual, -100.0),
                new("y", SharcOperator.LessOrEqual, 100.0)
            };

            // Warm up
            int warmupCount = 0;
            using (var warmup = sharcDb.CreateReader("primes", new[] { "n", "x", "y" }, filters))
            {
                while (warmup.Read()) warmupCount++;
            }

            Stopwatch sw = Stopwatch.StartNew();
            int count = 0;
            for (int i = 0; i < 10; i++)
            {
                using var reader = sharcDb.CreateReader("primes", new[] { "n", "x", "y" }, filters);
                while (reader.Read()) count++;
            }
            sw.Stop();

            Console.WriteLine($"  Sharc Spatial: {warmupCount} primes in bbox, 10 iterations");
            return sw.Elapsed.TotalMilliseconds;
        }
    }
}
