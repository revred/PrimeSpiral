# Prime Fibers: The PQR Hyperspace Definition

Based on the Ulam/Sacks property where primes align along quadratic curves, we formalize the user's "Prime Fiber" theory as follows.

## 1. The Hyperspace (Surface)
We define the "Sacks Surface" in 3D Cylindrical Coordinates $(\rho, \theta, z)$ mapped to PQR:
*   The Sacks Spiral is the level set $z=0$ of a **Paraboloid of Revolution**.
*   **Fundamental Equation**: $z = n$ (The integer index is the "height" or potential energy).
*   **Coordinate Mapping**:
    *   $P = \rho \cos \theta$ (Cartesian X)
    *   $Q = \rho \sin \theta$ (Cartesian Y)
    *   $R = \rho^2$ (The number $n$ itself, since $r = \sqrt{n}$ in Sacks)

Thus, the surface is defined by $R = P^2 + Q^2$ (a paraboloid).

## 2. The Prime Fibers (Parametric Curves)
A "Prime Fiber" is a curve lying on this surface that hits a high density of prime numbers.
In number theory, these are **Quadratic Polynomials**:
$n(k) = a k^2 + b k + c$

In our PQR space, these fibers appear as **Spirals** winding around the paraboloid.
*   Ideally, a "perfect fiber" connects only primes (e.g., Euler's $k^2+k+41$ for $k<40$).
*   The "Prediction" problem is: Given a set of primes, find the parameters $(a, b, c)$ of the Fiber that connects them, then extrapolate to $k+1$.

## 3. The PQR Control Plane
To allow the user to explore this, we define an interactive "Fiber Controller":

**Parametric Definition**:
We allow the user to define a Fiber by three control values $(A, B, C)$:
$$ n(\phi) = A \cdot \phi^2 + B \cdot \phi + C $$
Where $\phi$ is the "winding angle" (rotation).

*   **P-Axis (Curvature)**: Controls the quadratic term ($A$). High P = Tighter winding.
*   **Q-Axis (Linearity)**: Controls the linear term ($B$). Shifts the curve's alignment.
*   **R-Axis (Offset)**: Controls the constant ($C$). Moves the start point.

## 4. Implementation Plan
1.  **UI**: Add "Fiber Console" with sliders for A, B, C.
2.  **Vis**: Render the parametric curve $n(\phi)$ as a glowing yellow "thread" on the spiral.
3.  **Solver (The Oracle)**:
    *   User clicks 2 or 3 primes.
    *   System solves for $(A, B, C)$.
    *   System draws the Fiber.
    *   System highlights the *next* integer intersection on that Fiber (The Prediction).
