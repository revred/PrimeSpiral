using Microsoft.JSInterop;
using System;
using System.Collections.Generic;

namespace Sharp.Primer
{
    public class PrimeEngine
    {
        private static readonly object PrimeMapLock = new();
        private static int _cachedPrimeMapLimit = -1;
        private static byte[] _cachedPrimeMap = Array.Empty<byte>();

        public static byte[] GeneratePrimeMap(int limit)
        {
            if (limit < 1)
            {
                return new byte[Math.Max(2, limit + 1)];
            }

            lock (PrimeMapLock)
            {
                if (_cachedPrimeMapLimit == limit && _cachedPrimeMap.Length == limit + 1)
                {
                    return _cachedPrimeMap;
                }

                var map = new byte[limit + 1];

                for (int i = 2; i <= limit; i++)
                {
                    map[i] = 1;
                }

                int root = (int)Math.Sqrt(limit);
                for (int i = 2; i <= root; i++)
                {
                    if (map[i] == 0) continue;

                    int start = i * i;
                    for (int j = start; j <= limit; j += i)
                    {
                        map[j] = 0;
                    }
                }

                map[0] = 0;
                if (limit >= 1) map[1] = 0;

                _cachedPrimeMapLimit = limit;
                _cachedPrimeMap = map;
                return map;
            }
        }

        [JSInvokable]
        public static int[] GeneratePrimes(int limit)
        {
            if (limit < 2) return Array.Empty<int>();

            var primeMap = GeneratePrimeMap(limit);
            var primes = new List<int>((int)(limit / Math.Log(limit) * 1.1));

            for (int n = 2; n <= limit; n++)
            {
                if (primeMap[n] == 1) primes.Add(n);
            }

            return primes.ToArray();
        }

        [JSInvokable("GetPrimeMap")]
        public static byte[] GetPrimeMap(int limit)
        {
            return GeneratePrimeMap(limit);
        }

        [JSInvokable]
        public static string SayHello()
        {
            return "Hello from Blazor WebAssembly!";
        }
    }
}
