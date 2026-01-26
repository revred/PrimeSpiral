
function getPrimes(n) {
    const primes = [];
    let num = 2;
    while (primes.length < n) {
        if (isPrime(num)) {
            primes.push(num);
        }
        num++;
    }
    return primes;
}

function isPrime(num) {
    for (let i = 2, sqrt = Math.sqrt(num); i <= sqrt; i++) {
        if (num % i === 0) return false;
    }
    return num > 1;
}

const n = 100;
const primes = getPrimes(n);
const prime100 = primes[n - 1];

console.log(`The ${n}th prime spiral number (prime number) is: ${prime100}`);
