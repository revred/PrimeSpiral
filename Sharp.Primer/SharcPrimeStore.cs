using Microsoft.JSInterop;
using Sharc;
using Sharc.Vector;
using Sharc.Vector.Hnsw;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Text;

namespace Sharp.Primer;

/// <summary>
/// Sharc-backed data layer for PrimeSpiral.
/// Demonstrates SharcDatabase creation, SharcWriter bulk inserts,
/// PreparedReader zero-alloc B-tree seeks, HNSW vector search
/// for KNN neighbourhood queries, and SharcSchema introspection — all running in Blazor WASM.
/// </summary>
public static class SharcPrimeStore
{
    private static SharcDatabase? _db;
    private static SharcWriter? _writer;
    private static PreparedReader? _seekReader;   // SharcIsPrime + SharcBenchmarkSeek
    private static PreparedReader? _scanReader;   // SharcGetPrimesInRange + SharcGetStats
    private static JitQuery? _spatialJit;          // SharcGetNearestPrime (legacy fallback)
    private static VectorQuery? _vectorQuery;      // HNSW-accelerated KNN search
    private static HnswIndex? _hnswIndex;          // HNSW index over 2D embeddings
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
            _hnswIndex?.Dispose();
            _vectorQuery?.Dispose();
            _spatialJit?.Dispose();
            _scanReader?.Dispose();
            _seekReader?.Dispose();
            _writer?.Dispose();
            _db?.Dispose();
            _hnswIndex = null;
            _vectorQuery = null;
            _spatialJit = null;
            _scanReader = null;
            _seekReader = null;
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
                    "CREATE TABLE primes (n INTEGER PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, embedding BLOB NOT NULL)");
                ddlTx.Commit();
            }

            // --- Step 3: Bulk insert primes with spiral coordinates ---
            int primeCount = 0;
            for (int i = 0; i <= limit; i++) if (primeMap[i] == 1) primeCount++;

            // Build records as an enumerable for InsertBatch
            var records = BuildPrimeRecords(limit, primeMap, coordX, coordY);
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
            _seekReader = _db.PrepareReader("primes", "n");
            _scanReader = _db.PrepareReader("primes");
            _spatialJit = _db.Jit("primes");

            // Build HNSW index for sub-millisecond KNN neighbourhood search
            _hnswIndex = _db.BuildHnswIndex("primes", "embedding",
                DistanceMetric.Euclidean, persist: false);
            _vectorQuery = _db.Vector("primes", "embedding", DistanceMetric.Euclidean);
            _vectorQuery.UseIndex(_hnswIndex);

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

    private static IEnumerable<Sharc.Core.ColumnValue[]> BuildPrimeRecords(
        int limit, byte[] primeMap, double[] coordX, double[] coordY)
    {
        for (int n = 2; n <= limit; n++)
        {
            if (primeMap[n] != 1) continue;

            // Encode (x, y) as a 2D float vector for HNSW indexing
            byte[] embedding = BlobVectorCodec.Encode(
                new float[] { (float)coordX[n], (float)coordY[n] });
            int serialType = 12 + embedding.Length * 2; // SQLite BLOB serial type

            yield return new Sharc.Core.ColumnValue[]
            {
                (long)n,
                coordX[n],
                coordY[n],
                Sharc.Core.ColumnValue.Blob(serialType, embedding)
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  JSInvokable Methods — Sharc API Showcase
    // ═══════════════════════════════════════════════════════════════

    /// <summary>
    /// Initialize or extend the Sharc database with prime data up to the given limit.
    /// Supports progressive loading by allowing multiple calls with increasing limits.
    /// </summary>
    [JSInvokable("InitSharcStore")]
    public static string InitSharcStore(int limit)
    {
        var sw = Stopwatch.StartNew();
        
        // Step 1: Initialize DB if not already present
        if (_db == null)
        {
            const string tmpPath = "/tmp/primes_sharc.db";
            if (System.IO.File.Exists(tmpPath)) System.IO.File.Delete(tmpPath);

            var db = SharcDatabase.Create(tmpPath);
            using (var writer = SharcWriter.From(db))
            {
                using (var ddlTx = writer.BeginTransaction())
                {
                    ddlTx.Execute("CREATE TABLE primes (n INTEGER PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, embedding BLOB NOT NULL)");
                    ddlTx.Commit();
                }
            }
            db.Dispose();
            
            byte[] dbBytes = System.IO.File.ReadAllBytes(tmpPath);
            _db = SharcDatabase.OpenMemory(dbBytes, new SharcOpenOptions { Writable = true });
            _writer = SharcWriter.From(_db);
            _seekReader = _db.PrepareReader("primes", "n");
            _scanReader = _db.PrepareReader("primes");
            _spatialJit = _db.Jit("primes");
            _maxNumber = 0;
            _primeCount = 0;
            _isInitialized = true;
        }

        if (limit <= _maxNumber) return $"Already loaded up to {_maxNumber}";

        // Step 2: Sieve and Append
        byte[] primeMap = PrimeEngine.GeneratePrimeMap(limit);
        int startN = Math.Max(2, _maxNumber + 1);
        int addedCount = 0;
        double spacing = 1.0;
        double warpR0 = 120.0;

        IEnumerable<Sharc.Core.ColumnValue[]> BuildRecords()
        {
            for (int i = startN; i <= limit; i++)
            {
                if (primeMap[i] != 1) continue;
                addedCount++;

                double root = Math.Sqrt(i);
                double theta = root * 2.0 * Math.PI;
                double r = root * spacing;
                double rw = (r * r) / (r + warpR0);

                double px = -Math.Cos(theta) * rw;
                double py = Math.Sin(theta) * rw;
                byte[] embedding = BlobVectorCodec.Encode(
                    new float[] { (float)px, (float)py });
                int serialType = 12 + embedding.Length * 2;

                yield return new Sharc.Core.ColumnValue[]
                {
                    (long)i,
                    px,
                    py,
                    Sharc.Core.ColumnValue.Blob(serialType, embedding)
                };
            }
        }

        _writer!.InsertBatch("primes", BuildRecords());

        // Rebuild HNSW index after new data is inserted
        _hnswIndex?.Dispose();
        _vectorQuery?.Dispose();
        _hnswIndex = _db!.BuildHnswIndex("primes", "embedding",
            DistanceMetric.Euclidean, persist: false);
        _vectorQuery = _db.Vector("primes", "embedding", DistanceMetric.Euclidean);
        _vectorQuery.UseIndex(_hnswIndex);

        _primeCount += addedCount;
        _maxNumber = limit;

        sw.Stop();
        _initMs = sw.Elapsed.TotalMilliseconds;

        return $"Sharc OK: {_primeCount} primes total (up to {limit}), {_dbSizeBytes / 1024}KB, {sw.Elapsed.TotalMilliseconds:F1}ms";
    }

    /// <summary>
    /// B-tree point lookup: Is n prime?
    /// Demonstrates: SharcDataReader.Seek() — O(log N) B-tree binary search.
    /// </summary>
    [JSInvokable("SharcIsPrime")]
    public static bool SharcIsPrime(int n)
    {
        if (_seekReader == null || !_isInitialized) return false;

        using var reader = _seekReader.CreateReader();
        return reader.Seek(n);
    }

    /// <summary>
    /// Range query: Get all primes between minN and maxN.
    /// Demonstrates: SharcDataReader B-tree scan with Seek + forward iteration.
    /// </summary>
    [JSInvokable("SharcGetPrimesInRange")]
    public static int[] SharcGetPrimesInRange(int minN, int maxN)
    {
        if (_scanReader == null || !_isInitialized) return Array.Empty<int>();

        // Zero-alloc prepared reader — reuses cached cursor + reader state.
        using var reader = _scanReader.CreateReader();
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
    /// K-Nearest Neighbors (KNN) search using HNSW vector index.
    /// Finds the K closest primes to a target (x, y).
    /// Uses Sharc.Vector HNSW acceleration — sub-millisecond, no bounding box needed.
    /// </summary>
    [JSInvokable("SharcGetKNeighbors")]
    public static int[] SharcGetKNeighbors(double x, double y, int k, double initialRadius = 100.0)
    {
        if (_vectorQuery == null || !_isInitialized) return Array.Empty<int>();

        // HNSW-accelerated KNN — single call, pre-sorted by Euclidean distance
        var queryPoint = new float[] { (float)x, (float)y };
        var result = _vectorQuery.NearestTo(queryPoint, k, columnNames: "n");

        var ids = new int[result.Count];
        for (int i = 0; i < result.Count; i++)
            ids[i] = (int)Convert.ToInt64(result[i].Metadata!["n"]);
        return ids;
    }

    /// <summary>
    /// Nearest-prime query: Find the single closest prime to (x, y).
    /// Uses HNSW vector search — one call, no bounding box needed.
    /// </summary>
    [JSInvokable("SharcGetNearestPrime")]
    public static int SharcGetNearestPrime(double x, double y, double maxDist)
    {
        if (_vectorQuery == null || !_isInitialized) return -1;

        // HNSW-accelerated nearest-neighbor lookup (k=1)
        var queryPoint = new float[] { (float)x, (float)y };
        var result = _vectorQuery.NearestTo(queryPoint, k: 1, columnNames: "n");

        if (result.Count == 0) return -1;

        // Check distance threshold (result.Distance is Euclidean distance)
        if (result[0].Distance > (float)maxDist) return -1;

        return (int)Convert.ToInt64(result[0].Metadata!["n"]);
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

        // Count rows via prepared scan (zero-alloc after first call)
        var sw = Stopwatch.StartNew();
        int count = 0;
        using (var reader = _seekReader!.CreateReader())
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
            version = "Sharc 1.1.6-rc1 (Vector)"
        };
    }

    /// <summary>
    /// Timed point lookup benchmark: Measure Seek() latency.
    /// Demonstrates: Sub-microsecond B-tree point lookups.
    /// </summary>
    [JSInvokable("SharcBenchmarkSeek")]
    public static string SharcBenchmarkSeek(int iterations)
    {
        if (_seekReader == null || !_isInitialized)
            return "Error: Sharc not initialized";

        var rand = new Random(42);
        int maxN = _maxNumber;

        // Warm up — PreparedReader reuses cached cursor, zero alloc
        using (var warmup = _seekReader.CreateReader())
        {
            for (int i = 0; i < 50; i++)
                warmup.Seek(rand.Next(2, maxN));
        }

        // Measure — same prepared handle, no schema re-resolution
        var sw = Stopwatch.StartNew();
        int hits = 0;
        using (var reader = _seekReader.CreateReader())
        {
            for (int i = 0; i < iterations; i++)
            {
                if (reader.Seek(rand.Next(2, maxN)))
                    hits++;
            }
        }
        sw.Stop();

        double avgNs = sw.Elapsed.TotalMilliseconds * 1_000_000.0 / iterations;
        return $"[Sharc PreparedReader Seek] {iterations} lookups: {sw.Elapsed.TotalMilliseconds:F2}ms " +
               $"(avg {avgNs:F0}ns/op), hits: {hits}/{iterations}";
    }

    /// <summary>
    /// Timed HNSW KNN benchmark: Measure Sharc.Vector HNSW-accelerated KNN.
    /// </summary>
    [JSInvokable("SharcBenchmarkKNN")]
    public static string SharcBenchmarkKNN(int iterations, int k)
    {
        if (_vectorQuery == null || !_isInitialized)
            return "Error: Sharc not initialized";

        var rand = new Random(42);
        double range = Math.Sqrt(_maxNumber); 

        // Warm up
        for (int i = 0; i < 5; i++)
        {
            double rx = (rand.NextDouble() * 2 - 1) * range;
            double ry = (rand.NextDouble() * 2 - 1) * range;
            SharcGetKNeighbors(rx, ry, k);
        }

        var sw = Stopwatch.StartNew();
        for (int i = 0; i < iterations; i++)
        {
            double rx = (rand.NextDouble() * 2 - 1) * range;
            double ry = (rand.NextDouble() * 2 - 1) * range;
            SharcGetKNeighbors(rx, ry, k);
        }
        sw.Stop();

        double avgMs = sw.Elapsed.TotalMilliseconds / iterations;
        return $"[Sharc HNSW KNN (k={k})] {iterations} searches: {sw.Elapsed.TotalMilliseconds:F2}ms " +
               $"(avg {avgMs:F2}ms/op)";
    }
}
