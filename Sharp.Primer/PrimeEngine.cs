using Microsoft.JSInterop;
using System;
using System.Collections.Generic;
using System.Linq;

namespace Sharp.Primer
{
    public class PrimeEngine
    {
        [JSInvokable]
        public static int[] GeneratePrimes(int limit)
        {
            if (limit < 2) return Array.Empty<int>();

            // Sieve of Atkin Implementation
            // High performance C# implementation
            
            var isPrime = new bool[limit + 1];
            var sqrt = Math.Sqrt(limit);

            for (int x = 1; x <= sqrt; x++)
            {
                for (int y = 1; y <= sqrt; y++)
                {
                    int n = 4 * x * x + y * y;
                    if (n <= limit && (n % 12 == 1 || n % 12 == 5))
                        isPrime[n] ^= true;

                    n = 3 * x * x + y * y;
                    if (n <= limit && n % 12 == 7)
                        isPrime[n] ^= true;

                    n = 3 * x * x - y * y;
                    if (x > y && n <= limit && n % 12 == 11)
                        isPrime[n] ^= true;
                }
            }

            for (int n = 5; n <= sqrt; n++)
            {
                if (isPrime[n])
                {
                    int sq = n * n;
                    for (int k = sq; k <= limit; k += sq)
                        isPrime[k] = false;
                }
            }

            isPrime[2] = true;
            isPrime[3] = true;

            // Collect results
            // Optimize: Pre-calculate size or use List
            var primes = new List<int>((int)(limit / Math.Log(limit) * 1.1));
            if (limit >= 2) primes.Add(2);
            if (limit >= 3) primes.Add(3);

            for (int n = 5; n <= limit; n += 2)
            {
                if (isPrime[n]) primes.Add(n);
            }

            return primes.ToArray();
        }

        [JSInvokable]
        public static string SayHello()
        {
            return "Hello from Blazor WebAssembly!";
        }
    }
}
