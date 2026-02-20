using Microsoft.JSInterop;
using Sharc;
using Sharc.Core.Query;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;

namespace Sharp.Primer;

/// <summary>
/// Sharc-backed data layer for PrimeSpiral.
/// Demonstrates SharcDatabase creation, SharcWriter bulk inserts,
/// SharcDataReader B-tree seeks, SharcFilter range queries,
/// and SharcSchema introspection — all running in Blazor WASM.
/// </summary>
public static class SharcPrimeStore
{
    private static SharcDatabase? _db;
    private static SharcWriter? _writer;
    private static int _primeCount;
    private static int _maxNumber;
    private static long _dbSizeBytes;
    private static double _initMs;
    private static bool _isInitialized;

    /// <summary>
    /// Initializes the Sharc database from pre-computed grid data.
    /// Called internally after GridEngine.BuildGrid completes.
    /// </summary>
    internal static string InitFromGridData(int limit, byte[] primeMap, double[] coordX, double[] coordY)
    {
        if (_isInitialized && _maxNumber == limit)
            return $"Already initialized with {_primeCount} primes (limit={limit})";

        var sw = Stopwatch.StartNew();

        try
        {
            // Clean up previous instance
            _writer?.Dispose();
            _db?.Dispose();
            _writer = null;
            _db = null;

            // --- Step 1: Create database on Emscripten MEMFS ---
            const string tmpPath = "/tmp/primes_sharc.db";

            // Remove stale file if it exists
            if (System.IO.File.Exists(tmpPath))
                System.IO.File.Delete(tmpPath);

            var db = SharcDatabase.Create(tmpPath);
            var writer = SharcWriter.From(db);

            // --- Step 2: DDL — Create table via SharcWriteTransaction ---
            using (var ddlTx = writer.BeginTransaction())
            {
                ddlTx.Execute(
                    "CREATE TABLE primes (n INTEGER PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL)");
                ddlTx.Commit();
            }

            // --- Step 3: Bulk insert primes with spiral coordinates ---
            int primeCount = 0;

            // Build records as an enumerable for InsertBatch
            var records = BuildPrimeRecords(limit, primeMap, coordX, coordY, out primeCount);
            writer.InsertBatch("primes", records);

            // --- Step 4: Read bytes back and switch to OpenMemory ---
            db.Dispose();
            writer.Dispose();

            byte[] dbBytes = System.IO.File.ReadAllBytes(tmpPath);
            _dbSizeBytes = dbBytes.Length;

            // Clean up temp file
            try { System.IO.File.Delete(tmpPath); } catch { /* best effort */ }

            // Open for reads (and future writes) from memory
            _db = SharcDatabase.OpenMemory(dbBytes, new SharcOpenOptions { Writable = true });
            _writer = SharcWriter.From(_db);
            _primeCount = primeCount;
            _maxNumber = limit;
            _isInitialized = true;

            sw.Stop();
            _initMs = sw.Elapsed.TotalMilliseconds;

            return $"Sharc OK: {primeCount} primes, {_dbSizeBytes / 1024}KB, {_initMs:F1}ms";
        }
        catch (Exception ex)
        {
            sw.Stop();
            _initMs = sw.Elapsed.TotalMilliseconds;
            return $"Sharc Error: {ex.Message}";
        }
    }

    private static List<Sharc.Core.ColumnValue[]> BuildPrimeRecords(
        int limit, byte[] primeMap, double[] coordX, double[] coordY, out int primeCount)
    {
        // Estimate: π(N) ≈ N / ln(N)
        int estimate = limit > 10 ? (int)(limit / Math.Log(limit) * 1.15) : 10;
        var records = new List<Sharc.Core.ColumnValue[]>(estimate);
        primeCount = 0;

        for (int n = 2; n <= limit; n++)
        {
            if (primeMap[n] != 1) continue;

            records.Add(new Sharc.Core.ColumnValue[]
            {
                (long)n,
                coordX[n],
                coordY[n]
            });
            primeCount++;
        }

        return records;
    }

    // ═══════════════════════════════════════════════════════════════
    //  JSInvokable Methods — Sharc API Showcase
    // ═══════════════════════════════════════════════════════════════

    /// <summary>
    /// Initialize Sharc database with prime data up to the given limit.
    /// Demonstrates: SharcDatabase.Create, SharcWriter, SharcWriteTransaction.Execute (DDL).
    /// </summary>
    [JSInvokable("InitSharcStore")]
    public static string InitSharcStore(int limit)
    {
        byte[] primeMap = PrimeEngine.GeneratePrimeMap(limit);

        // Compute coordinates (replicating GridEngine's math)
        double spacing = 1.0;
        double warpR0 = 120.0;
        double[] coordX = new double[limit + 1];
        double[] coordY = new double[limit + 1];

        for (int i = 0; i <= limit; i++)
        {
            double root = Math.Sqrt(i);
            double theta = root * 2.0 * Math.PI;
            double r = root * spacing;
            double rw = (r * r) / (r + warpR0);

            coordX[i] = -Math.Cos(theta) * rw;
            coordY[i] = Math.Sin(theta) * rw;
        }

        return InitFromGridData(limit, primeMap, coordX, coordY);
    }

    /// <summary>
    /// B-tree point lookup: Is n prime?
    /// Demonstrates: SharcDataReader.Seek() — O(log N) B-tree binary search.
    /// </summary>
    [JSInvokable("SharcIsPrime")]
    public static bool SharcIsPrime(int n)
    {
        if (_db == null || !_isInitialized) return false;

        using var reader = _db.CreateReader("primes", "n");
        return reader.Seek(n);
    }

    /// <summary>
    /// Range query: Get all primes between minN and maxN.
    /// Demonstrates: SharcDataReader B-tree scan with Seek + forward iteration.
    /// </summary>
    [JSInvokable("SharcGetPrimesInRange")]
    public static int[] SharcGetPrimesInRange(int minN, int maxN)
    {
        if (_db == null || !_isInitialized) return Array.Empty<int>();

        // Seek to first candidate, then forward-scan B-tree in rowid order.
        // This leverages the B-tree's natural ordering by INTEGER PRIMARY KEY.
        using var reader = _db.CreateReader("primes");
        var results = new List<int>();

        // Seek positions the cursor at (or near) the target rowid
        reader.Seek(minN);

        // Scan forward collecting primes in range
        while (reader.Read())
        {
            long n = reader.GetInt64(0);
            if (n > maxN) break;
            if (n >= minN) results.Add((int)n);
        }

        return results.ToArray();
    }

    /// <summary>
    /// Spatial bounding-box query: Find nearest prime to (x, y).
    /// Demonstrates: SharcFilter with multiple columns (x, y bounding box).
    /// </summary>
    [JSInvokable("SharcGetNearestPrime")]
    public static int SharcGetNearestPrime(double x, double y, double maxDist)
    {
        if (_db == null || !_isInitialized) return -1;

        var filters = new SharcFilter[]
        {
            new("x", SharcOperator.GreaterOrEqual, x - maxDist),
            new("x", SharcOperator.LessOrEqual, x + maxDist),
            new("y", SharcOperator.GreaterOrEqual, y - maxDist),
            new("y", SharcOperator.LessOrEqual, y + maxDist)
        };

        using var reader = _db.CreateReader("primes", new[] { "n", "x", "y" }, filters);

        int nearestId = -1;
        double minDistSq = maxDist * maxDist;

        while (reader.Read())
        {
            double px = reader.GetDouble(1);
            double py = reader.GetDouble(2);
            double dx = px - x;
            double dy = py - y;
            double distSq = dx * dx + dy * dy;

            if (distSq < minDistSq)
            {
                minDistSq = distSq;
                nearestId = (int)reader.GetInt64(0);
            }
        }

        return nearestId;
    }

    /// <summary>
    /// Schema introspection: Return table and column metadata.
    /// Demonstrates: SharcSchema — programmatic access to database structure.
    /// </summary>
    [JSInvokable("SharcGetSchema")]
    public static object? SharcGetSchema()
    {
        if (_db == null || !_isInitialized) return null;

        var schema = _db.Schema;
        var tables = new List<object>();

        foreach (var table in schema.Tables)
        {
            var columns = new List<object>();
            foreach (var col in table.Columns)
            {
                columns.Add(new
                {
                    name = col.Name,
                    type = col.DeclaredType,
                    isPrimaryKey = col.IsPrimaryKey,
                    ordinal = col.Ordinal
                });
            }

            tables.Add(new
            {
                name = table.Name,
                columns,
                indexCount = table.Indexes.Count
            });
        }

        return new { tables };
    }

    /// <summary>
    /// Database statistics: Row counts, DB size, init timing, version.
    /// Demonstrates: SharcDataReader iteration, database metadata.
    /// </summary>
    [JSInvokable("SharcGetStats")]
    public static object? SharcGetStats()
    {
        if (_db == null || !_isInitialized) return null;

        // Count rows via scan (demonstrating reader pattern)
        var sw = Stopwatch.StartNew();
        int count = 0;
        using (var reader = _db.CreateReader("primes", "n"))
        {
            while (reader.Read()) count++;
        }
        sw.Stop();

        return new
        {
            primeCount = count,
            maxNumber = _maxNumber,
            dbSizeKB = _dbSizeBytes / 1024,
            initMs = Math.Round(_initMs, 1),
            scanMs = Math.Round(sw.Elapsed.TotalMilliseconds, 2),
            tableCount = _db.Schema.Tables.Count,
            version = "Sharc 1.0.1-alpha"
        };
    }

    /// <summary>
    /// Timed point lookup benchmark: Measure Seek() latency.
    /// Demonstrates: Sub-microsecond B-tree point lookups.
    /// </summary>
    [JSInvokable("SharcBenchmarkSeek")]
    public static string SharcBenchmarkSeek(int iterations)
    {
        if (_db == null || !_isInitialized)
            return "Error: Sharc not initialized";

        var rand = new Random(42);
        int maxN = _maxNumber;

        // Warm up
        using (var warmup = _db.CreateReader("primes", "n"))
        {
            for (int i = 0; i < 50; i++)
                warmup.Seek(rand.Next(2, maxN));
        }

        // Measure
        var sw = Stopwatch.StartNew();
        int hits = 0;
        using (var reader = _db.CreateReader("primes", "n"))
        {
            for (int i = 0; i < iterations; i++)
            {
                if (reader.Seek(rand.Next(2, maxN)))
                    hits++;
            }
        }
        sw.Stop();

        double avgNs = sw.Elapsed.TotalMilliseconds * 1_000_000.0 / iterations;
        return $"[Sharc Seek] {iterations} lookups: {sw.Elapsed.TotalMilliseconds:F2}ms " +
               $"(avg {avgNs:F0}ns/op), hits: {hits}/{iterations}";
    }
}
