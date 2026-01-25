using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;

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

        class TestResult
        {
            public string Category { get; set; }
            public string TestName { get; set; }
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

            // Print Grid
            PrintGrid(results);

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
    }
}
