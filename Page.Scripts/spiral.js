/**
 * HIGH PERFORMANCE PRIME SPIRAL (SACKS)
 * Refactored for Stability & Isolation (Phase 3 Prep)
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });

const canvasOverlay = document.getElementById('canvas-overlay');
const ctxOverlay = canvasOverlay.getContext('2d');
const infoPanel = document.getElementById('info-content');

// --- MODULES ---
// 1. Fiber Manager Stub
const fiberManager = window.fiberManager || {
  init: () => console.warn("FiberManager missing: init skipped"),
  isFiber: () => false,
  fiberConfigs: {}
};

// 2. Camera System
const camera = new Camera(window.innerWidth / 2, window.innerHeight / 2);
window.camera = camera; // Expose for debugging

// 3. Input System
const inputHandler = new InputHandler(canvasOverlay, camera, () => {
  requestAnimationFrame(draw);
  requestAnimationFrame(drawOverlay);

  // --- MOUSE HOVER LOGIC (Prime Pearls) ---
  if (!grid || !cacheX) {
    if (Math.random() < 0.05) console.log("[InputHandler] Early Return: Grid/Cache Missing", !!grid, !!cacheX);
    return;
  }

  const wx = window.mouseWorldX;
  const wy = window.mouseWorldY;
  // DEBUG
  if (Math.random() < 0.05) console.log(`[Input] wx:${wx.toFixed(1)} wy:${wy.toFixed(1)} Scale:${camera.renderScale}`);

  // Performance Check: Only run if mouse moved significantly or scale allows
  // Use expanding radius search on Grid
  // Base radius: 50 units (tuned)
  let searchRad = 50 / camera.renderScale;
  if (searchRad < 10) searchRad = 10;

  // 1. Find Nearest Prime (WASM Accelerated)
  // Async check - fire and forget, update on resolve
  if (window.wasmEngine && window.wasmEngine.isReady) {
    window.wasmEngine.getNearest(wx, wy, searchRad).then(nearestId => {
      processHover(nearestId, wx, wy);
    });
  } else {
    // Fallback or wait
    return;
  }

  // NOTE: Logic moved to processHover to handle async result
  /*
  const query = grid.queryPrimes(wx - searchRad, wy - searchRad, wx + searchRad, wy + searchRad);
  let minDist = Infinity;
  let nearest = null;
  for (const chunk of query.chunks) { ... } 
  */
  return; // Skip sync logic

  function processHover(nearest, wx, wy) {
    if (elementHovered) return; // Don't process if hovering UI (stub)

    // Recalculate dist for threshold check (WASM returns ID, we need exact screen dist)
    // nearest is the ID or -1
    if (nearest === -1) nearest = null;

    let minDist = Infinity;
    if (nearest !== null) {
      const dx = cacheX[nearest] - wx;
      const dy = cacheY[nearest] - wy;
      minDist = dx * dx + dy * dy;
    }
    // Continue with existing logic...


    // Threshold Check
    const screenDist = Math.sqrt(minDist) * camera.renderScale;
    const SNAP_DIST = 50; // Increased hit area for better usability

    if (nearest && screenDist < SNAP_DIST) {
      // DENSITY CHECK: Distance to neighbors
      // If P_n and P_n+1 are closer than PEARL_THRESHOLD px, don't show pearls
      const idxInList = primeList.indexOf(nearest);
      let tooDense = false;
      if (idxInList > 0) {
        const prev = primeList[idxInList - 1];
        const dp = Math.hypot(cacheX[nearest] - cacheX[prev], cacheY[nearest] - cacheY[prev]) * camera.renderScale;
        if (dp < PEARL_THRESHOLD) tooDense = true;
      }

      if (!tooDense) {
        if (hoveredPrime !== nearest) {
          hoveredPrime = nearest;
          // Find K-Neighbors
          hoveredNeighbors = findKNearestNeighbors(nearest, K_NEIGHBORS);
          requestAnimationFrame(drawOverlay);
        }
      } else {
        // Cleared because too dense
        if (hoveredPrime !== null) {
          hoveredPrime = null;
          requestAnimationFrame(drawOverlay);
        }
      }
    } else {
      // Not near any prime
      if (hoveredPrime !== null) {
        hoveredPrime = null;
        requestAnimationFrame(drawOverlay);
      }
    }

  }

  // Debug Mouse
  if (dbgMouse) dbgMouse.innerText = `${wx.toFixed(0)}, ${wy.toFixed(0)}`;
});

// Shift Key State
let isShiftPressed = false;
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') {
    if (!isShiftPressed) {
      isShiftPressed = true;
      requestAnimationFrame(drawOverlay);
    }
  }
});
window.addEventListener('keyup', (e) => {
  if (e.key === 'Shift') {
    if (isShiftPressed) {
      isShiftPressed = false;
      requestAnimationFrame(drawOverlay);
    }
  }
});

// --- HELPER: Angular Difference ---
function getAngleDiff(a1, a2) {
  let diff = Math.abs(a1 - a2);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  return diff;
}

function findKNearestNeighbors(centerIdx, k) {
  const cx = cacheX[centerIdx];
  const cy = cacheY[centerIdx];
  // Search Radius
  const radius = Math.sqrt(centerIdx) * 0.5 + 50;
  const query = grid.queryPrimes(cx - radius, cy - radius, cx + radius, cy + radius);

  // Collect all candidates
  const candidates = [];
  for (const chunk of query.chunks) {
    for (const idx of chunk) {
      if (idx === centerIdx) continue;
      const dx = cacheX[idx] - cx;
      const dy = cacheY[idx] - cy;
      const dist = dx * dx + dy * dy;
      const angle = Math.atan2(dy, dx);
      candidates.push({ id: idx, dist: dist, angle: angle });
    }
  }

  // Sort by distance
  candidates.sort((a, b) => a.dist - b.dist);

  // Filter by Angle (Occlusion/Sector)
  // Only accept if angle diff > threshold from ALL previously accepted
  const accepted = [];
  const ANG_THRESHOLD = 0.25; // ~15 degrees

  for (const cand of candidates) {
    if (accepted.length >= k) break;

    // Check angle against accepted
    let duplicateDirection = false;
    for (const acc of accepted) {
      if (getAngleDiff(cand.angle, acc.angle) < ANG_THRESHOLD) {
        duplicateDirection = true;
        break;
      }
    }

    if (!duplicateDirection) {
      accepted.push(cand);
    }
  }

  return accepted.map(c => c.id);
}

// --- Data Store ---
// --- CONTENT ---
// --- CONTENT ---
var primeMap;
var cacheX;
var cacheY;
var maxNumber = 2000000;
var minNumber = 0; // New: Hollow Center
const SPACING = 1;
// CHUNK_SIZE moved to spatialGrid.js
const SAFETY_LIMIT = 50000;
const K_NEIGHBORS = 5;
const PEARL_THRESHOLD = 15; // Minimum pixel distance for visualization activation
let hoveredPrime = null;
let hoveredNeighbors = [];

// --- Assets ---
let noiseTexture = null; // Unused but kept for compatibility

// --- Profiler ---
const btnProfile = document.getElementById('btn-profile-hud');
const elProfileResults = document.getElementById('disp-profile-results');

class Profiler {
  constructor() {
    this.active = false;
    this.startTime = 0;
    this.duration = 0;
    this.frames = 0;
    this.renderTimes = [];
    this.batchTimes = [];
    this.metrics = new Map();
    this.frameCounts = new Map();
  }

  start(duration) {
    this.active = true;
    this.startTime = performance.now();
    this.duration = duration;
    this.frames = 0;
    this.renderTimes = [];
    this.batchTimes = [];
    this.metrics.clear();
    this.frameCounts.clear();
    // Update pointer events to allow interaction with HUD if needed, though it is click-through mostly.
    if (elProfileResults) {
      elProfileResults.style.display = 'block';
      elProfileResults.innerText = "Profiling... (Interact to test)";
    }
  }

  logFrame(ms) {
    if (!this.active) return;
    this.frames++;
    this.renderTimes.push(ms);
    if (performance.now() - this.startTime > this.duration) {
      this.stop();
    }
  }

  logBatch(ms) {
    if (!this.active) return;
    this.batchTimes.push(ms);
  }

  markStart(label) {
    if (!this.active) return 0;
    return performance.now();
  }

  markEnd(label, start) {
    if (!this.active) return;
    const dur = performance.now() - start;
    this.metrics.set(label, (this.metrics.get(label) || 0) + dur);
    this.frameCounts.set(label, (this.frameCounts.get(label) || 0) + 1);
  }

  stop() {
    this.active = false;
    const avg = this.renderTimes.reduce((a, b) => a + b, 0) / (this.renderTimes.length || 1);
    const avgBatch = this.batchTimes.reduce((a, b) => a + b, 0) / (this.batchTimes.length || 1);
    const maxBatch = Math.max(...this.batchTimes, 0);

    let metricsMsg = "";
    for (const [label, totalDur] of this.metrics) {
      const count = this.frameCounts.get(label) || 1;
      const mAvg = totalDur / count;
      metricsMsg += `  ${label}: ${mAvg.toFixed(3)}ms\n`;
    }

    let msg = `Results:\n`;
    msg += `Avg Frame: ${avg.toFixed(2)}ms (~${(1000 / avg).toFixed(0)} FPS)\n`;
    msg += `Max Block: ${maxBatch.toFixed(2)}ms\n`;
    msg += `Details:\n${metricsMsg}`;

    if (elProfileResults) elProfileResults.innerText = msg;
    console.log("Profile Complete");

    // Automation Hook
    window.lastProfileData = {};
    for (const [label, totalDur] of this.metrics) {
      const count = this.frameCounts.get(label) || 1;
      window.lastProfileData[label] = totalDur / count;
    }
  }
}
const profiler = new Profiler();
window.startProfile = (d) => profiler.start(d);
window.stopProfile = () => profiler.stop();

// --- UI Stats ---
const elMax = document.getElementById('inp-max');
const elVisible = document.getElementById('disp-visible');
const elFps = document.getElementById('disp-fps');
const elRenderTime = document.getElementById('disp-render-time');
const elStrategy = document.getElementById('disp-strategy');

// --- Debug HUD ---
const dbgDpr = document.getElementById('dbg-dpr');
const dbgRes = document.getElementById('dbg-res');
const dbgZoom = document.getElementById('dbg-zoom');
const dbgMouse = document.getElementById('dbg-mouse');
const dbgVisibleCount = document.getElementById('dbg-visible-count');
const dbgStrategyVal = document.getElementById('dbg-strategy-val');
const dbgOffset = document.getElementById('dbg-offset');
const dbgMin = document.getElementById('dbg-min');
const dbgMax = document.getElementById('dbg-max');

// --- UI STATE & HELPERS ---
const UI = {
  // Elements
  btnGrid: document.getElementById('btn-toggle-grid'),
  btnSq: document.getElementById('btn-toggle-sq'),
  btnP2: document.getElementById('btn-toggle-pow2'),
  btnP10: document.getElementById('btn-toggle-pow10'),
  btnFlux: document.getElementById('btn-toggle-flux'),
  btnEuler: document.getElementById('btn-toggle-fiber-euler'),
  btnLegendre: document.getElementById('btn-toggle-fiber-legendre'),
  btnExtracted: document.getElementById('btn-toggle-extracted'),

  // Helper to check state
  isActive: (id) => {
    const el = document.getElementById(id);
    return el && el.classList.contains('active');
  },

  // Toggle Logic
  toggle: (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.toggle('active');
      requestAnimationFrame(drawOverlay);
    }
  }
};

// Wire up Buttons
if (UI.btnGrid) UI.btnGrid.onclick = () => UI.toggle('btn-toggle-grid');
if (UI.btnSq) UI.btnSq.onclick = () => UI.toggle('btn-toggle-sq');
if (UI.btnP2) UI.btnP2.onclick = () => UI.toggle('btn-toggle-pow2');
if (UI.btnP10) UI.btnP10.onclick = () => UI.toggle('btn-toggle-pow10');
if (UI.btnFlux) UI.btnFlux.onclick = () => UI.toggle('btn-toggle-flux');
if (UI.btnEuler) UI.btnEuler.onclick = () => UI.toggle('btn-toggle-fiber-euler');
if (UI.btnLegendre) UI.btnLegendre.onclick = () => UI.toggle('btn-toggle-fiber-legendre');
if (UI.btnExtracted) UI.btnExtracted.onclick = () => UI.toggle('btn-toggle-extracted');

// Old Checkbox Refs 
const checkWarp = document.getElementById('toggle-warp');
const checkGrid = { get checked() { return UI.isActive('btn-toggle-grid'); } };
const checkSq = { get checked() { return UI.isActive('btn-toggle-sq'); } };
const checkPow2 = { get checked() { return UI.isActive('btn-toggle-pow2'); } };
const checkPow10 = { get checked() { return UI.isActive('btn-toggle-pow10'); } };
const checkFlux = { get checked() { return UI.isActive('btn-toggle-flux'); } };
const toggleEuler = { get checked() { return UI.isActive('btn-toggle-fiber-euler'); } };
const toggleLegendre = { get checked() { return UI.isActive('btn-toggle-fiber-legendre'); } };

const checkDebug = document.getElementById('toggle-debug');
const sliderR0 = document.getElementById('warp-r0');
const elR0 = document.getElementById('disp-r0');
const checkHeatmap = document.getElementById('toggle-heatmap');

// Grid logic moved to spatialGrid.js

const grid = new SpiralGrid();

// --- CORE LOGIC ---
function allocateBuffers(max) {
  maxNumber = max;
  // minNumber stays as is? Yes.
  primeMap = new Uint8Array(maxNumber + 1);
  cacheX = new Float32Array(maxNumber + 1);
  cacheY = new Float32Array(maxNumber + 1);
  if (fiberManager && fiberManager.init) fiberManager.init(max);
}

// Global hook for Min Number
window.updateMinNumber = (val) => {
  minNumber = val;
  // Re-build spatial grid to remove points < minNumber
  grid.build();
  // Re-trigger analysis as the density grid changes
  triggerAnalysis();
  requestAnimationFrame(draw);
};

function initPrimes() {
  primeMap.fill(1);
  primeMap[0] = 0; primeMap[1] = 0;
  for (let i = 2; i * i <= maxNumber; i++) {
    if (primeMap[i]) {
      for (let j = i * i; j <= maxNumber; j += i) primeMap[j] = 0;
    }
  }
  updateCache();

  // Pre-calculate Special Points for Layered Rendering
  // PRECISION UPDATE: Generate using Integer Math (No FP errors)
  p10List = [];
  p2List = [];
  sqList = [];

  // Power of 10 (1, 10, 100...)
  for (let k = 10; k <= maxNumber; k *= 10) {
    p10List.push(k);
  }
  // Note: 1 is usually P10? Math.log10(1) = 0. Yes.
  // My loop started at 10. Let's add 1.
  if (maxNumber >= 1) p10List.unshift(1);

  // Power of 2 (1, 2, 4...)
  for (let k = 1; k <= maxNumber; k *= 2) {
    if (k > 1) p2List.push(k); // 1 is already in P10 usually, avoid clutter? 
    // Actually 1 is distinct. Let's keep it if consistent.
    // (1 & 0) == 0. Yes.
  }
  // Duplicates? 1 is both. 
  // Let's just push.

  // Perfect Squares (Silver Seam)
  for (let s = 1; s * s <= maxNumber; s++) {
    sqList.push(s * s);
  }

  // Update HUD Counts
  const elCounts = document.getElementById('dbg-counts');
  if (elCounts) {
    elCounts.innerHTML = `P10:<span style="color:#0f0">${p10List.length}</span> P2:<span style="color:#a0f">${p2List.length}</span> Sq:<span style="color:#ccc">${sqList.length}</span>`;
  }
}

let p10List = [];
let p2List = [];
let sqList = [];

function warpR(r, R0) { return (r * r) / (r + R0); }

function updateCache() {
  const R0 = +sliderR0.value;
  const useWarp = checkWarp.checked;
  const PI2 = Math.PI * 2;

  if (elProfileResults) elProfileResults.innerText = "Calculating...";

  // Process sync for simplicity (removing progressive for stability refactor first)
  // "Isolate areas... maintain stability" -> Simpler is more stable.
  // HOLLOW SPIRAL: Skip points below minNumber
  for (let i = minNumber; i <= maxNumber; i++) {
    const root = Math.sqrt(i);
    const r = root * SPACING;
    const theta = root * PI2;
    const rw = useWarp ? warpR(r, R0) : r;
    cacheX[i] = -Math.cos(theta) * rw;
    cacheY[i] = Math.sin(theta) * rw;
  }

  // Clear or invalidate indices below minNumber?
  // Not strictly needed if grid.build loop is also updated, which is efficient.

  grid.build();
  // Sync WASM Grid
  if (window.wasmEngine && window.wasmEngine.isReady) {
    window.wasmEngine.buildGrid(maxNumber).then(() => {
      console.log("[Spiral] WASM Grid Synced");
    });
  }
  updateWarpGraph();
  if (elProfileResults) elProfileResults.innerText = "Ready.";
  if (heatmapLayer && heatmapLayer.zGrid === null) triggerAnalysis();
  requestAnimationFrame(draw);
}

function updateWarpGraph() {
  const w = document.getElementById('warp-graph').width;
  const h = document.getElementById('warp-graph').height;
  const ctxG = document.getElementById('warp-graph').getContext('2d');
  ctxG.clearRect(0, 0, w, h);
  // ... (Simplified graph logic)
  ctxG.strokeStyle = "#4db8ff";
  ctxG.beginPath();
  ctxG.moveTo(0, h);
  ctxG.lineTo(w, 0);
  ctxG.stroke();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  canvasOverlay.width = w * dpr;
  canvasOverlay.height = h * dpr;
  canvasOverlay.style.width = w + 'px';
  canvasOverlay.style.height = h + 'px';

  ctx.scale(dpr, dpr);
  ctxOverlay.scale(dpr, dpr);

  camera.resize(w, h);
  requestAnimationFrame(draw);
  requestAnimationFrame(drawOverlay);
}

// --- RENDER ---
function draw(timestamp) {
  const start = performance.now();

  // UPDATE CAMERA
  const isMoving = camera.update();
  if (isMoving) requestAnimationFrame(draw);

  // Apply Stability
  const stabilityActive = document.getElementById('toggle-stability') ? document.getElementById('toggle-stability').checked : false;
  if (stabilityActive) {
    camera.applyEffect('SCALE', 0.05);
    requestAnimationFrame(draw); // Keep animating
  }

  // Use Render State from Camera
  const scale = camera.renderScale;
  const cx = camera.centerX;
  const cy = camera.centerY;
  const ox = camera.renderOffset.x;
  const oy = camera.renderOffset.y;
  const W = canvas.width / (window.devicePixelRatio || 1);
  const H = canvas.height / (window.devicePixelRatio || 1);

  // Bounds
  const tl = camera.screenToWorld(0, 0);
  const br = camera.screenToWorld(W, H);

  const query = grid.query(tl.x, tl.y, br.x, br.y);
  const visibleChunks = query.chunks;
  const count = query.count;

  // Strategy
  let strategy = 'VECTOR';
  if (scale < 0.2 || count > SAFETY_LIMIT) strategy = 'PIXEL';

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(cx + ox, cy + oy);
  ctx.scale(scale, scale);

  const dotSize = 1.2 / scale;

  if (strategy === 'VECTOR') {
    const isP10 = checkPow10.checked;
    const isP2 = checkPow2.checked;
    const isSq = checkSq.checked;

    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    for (const chunk of visibleChunks) {
      for (let i of chunk) {
        if (primeMap[i] === 1) {
          ctx.rect(cacheX[i] - dotSize / 2, cacheY[i] - dotSize / 2, dotSize, dotSize);
        }
      }
    }
    ctx.fill();

    // Special points are now handled in Layer 2 (Global Lists) for performance.

  } else {
    // Pixel Mode - Hyper Optimized (Bit-Blit)
    // 1. Get Prime Only chunks
    const pQuery = grid.queryPrimes(tl.x, tl.y, br.x, br.y);

    // 2. Prepare Buffer
    // USE PHYSICAL DIMENSIONS for ImageData (Bit-Blit works in device pixels)
    const dpr = window.devicePixelRatio || 1;
    const iW = canvas.width; // Physical
    const iH = canvas.height; // Physical
    const imgData = ctx.createImageData(iW, iH);
    const buf32 = new Uint32Array(imgData.data.buffer);

    // 3. Blit
    // Color: Red (ABGR = 0xFF0000FF)
    const COLOR = 0xFF0000FF;
    // Background: #0d0d0d (ABGR = 0xFF0d0d0d)
    const BG_COLOR = 0xFF0d0d0d;

    // Fill background (Robust clear + solid color)
    buf32.fill(BG_COLOR);

    // Pre-calc transforms (Logical -> Physical)
    const offX = cx + ox;
    const offY = cy + oy;

    for (const chunk of pQuery.chunks) {
      for (let i of chunk) {
        // Project to Screen (Logical) then scale to Physical (DPR)
        // x_phy = (worldX * scale + offX) * dpr
        const sx = ((cacheX[i] * scale + offX) * dpr) | 0;
        const sy = ((cacheY[i] * scale + offY) * dpr) | 0;

        if (sx >= 0 && sx < iW && sy >= 0 && sy < iH) {
          buf32[sy * iW + sx] = COLOR;
        }
      }
    }

    // Put at (0,0) (Physical)
    // Note: putImageData ignores context transform, so it works directly in device pixels.
    // However, our ctx might be scaled? putImageData resets to device coords.
    ctx.putImageData(imgData, 0, 0);
  }

  // LAYER 2: Special Points (Silver/Green/Purple) - Always drawn ON TOP
  // Precedence: Purple > Green > Silver
  // Draw Order: Silver -> Green -> Purple

  const isP10 = checkPow10.checked;
  const isP2 = checkPow2.checked;
  const isSq = checkSq.checked;

  // 3 Screen Pixels Minimum size for visibility
  const specialSize = 3 / scale;

  if (isSq) {
    ctx.fillStyle = "#C0C0C0"; // Silver
    ctx.strokeStyle = "#C0C0C0";
    ctx.lineWidth = Math.max(1, 2 / scale); // Keep visible

    // Feature: Render as solid line if zoomed out
    if (scale < 0.5) {
      // Find furthest square
      const maxRoot = Math.floor(Math.sqrt(maxNumber));
      const lastSq = maxRoot * maxRoot;

      ctx.beginPath();
      ctx.moveTo(cacheX[1], cacheY[1]); // Start at 1
      ctx.lineTo(cacheX[lastSq], cacheY[lastSq]); // End at max
      ctx.stroke();
    } else {
      // Render points
      for (let i of sqList) {
        if (i > maxNumber) break;
        if (i < minNumber) continue; // HOLLOW
        const x = cacheX[i];
        const y = cacheY[i];
        if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) {
          ctx.fillRect(x - specialSize / 2, y - specialSize / 2, specialSize, specialSize);
        }
      }
    }
  }

  if (isP10) {
    ctx.fillStyle = "#00ff00";
    for (let i of p10List) {
      if (i > maxNumber) break;
      if (i < minNumber) continue; // HOLLOW
      const x = cacheX[i];
      const y = cacheY[i];
      // Bounds Check
      if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) {
        ctx.fillRect(x - specialSize / 2, y - specialSize / 2, specialSize, specialSize);
      }
    }
  }

  if (isP2) {
    ctx.fillStyle = "#aa00ff"; // Purple
    for (let i of p2List) {
      if (i > maxNumber) break;
      if (i < minNumber) continue; // HOLLOW
      const x = cacheX[i];
      const y = cacheY[i];
      if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) {
        ctx.fillRect(x - specialSize / 2, y - specialSize / 2, specialSize, specialSize);
      }
    }
  }

  ctx.restore();

  // Stats
  if (elVisible) elVisible.innerText = count.toLocaleString();
  if (elRenderTime) elRenderTime.innerText = (performance.now() - start).toFixed(1) + "ms";
  if (elStrategy) elStrategy.innerText = strategy;

  // HUD
  if (dbgZoom) dbgZoom.innerText = scale.toFixed(4);
  if (dbgVisibleCount) dbgVisibleCount.innerText = count.toLocaleString();
  if (dbgStrategyVal) dbgStrategyVal.innerText = strategy;
  if (dbgOffset) dbgOffset.innerText = `${ox.toFixed(0)}, ${oy.toFixed(0)}`;
  if (dbgMin) dbgMin.innerText = `${tl.x.toFixed(1)}, ${tl.y.toFixed(1)}`;
  if (dbgMax) dbgMax.innerText = `${br.x.toFixed(1)}, ${br.y.toFixed(1)}`;

  // Sync Overlay (Fibres/Heatmap) with current frame
  drawOverlay();
}

function drawOverlay() {
  // console.log("[drawOverlay] Called");
  // Use Physical Clear (Robust)
  const dpr = window.devicePixelRatio || 1;
  ctxOverlay.save();
  ctxOverlay.setTransform(1, 0, 0, 1, 0, 0); // Identity
  ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
  ctxOverlay.restore(); // Restore dpr scale set in resize()

  // --- HOVER / INSPECTOR LOGIC ---
  // Uses global `hoveredPrime` set by InputHandler

  const inspector = document.getElementById('inspector-content');

  if (hoveredPrime !== null) {
    const pH = hoveredPrime;
    const isPrime = primeMap[pH] === 1;

    // Build Inspector HTML
    let html = `
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <span style="font-size:18px; color:#fff; font-weight:bold;">${pH.toLocaleString()}</span>
        <span style="font-size:10px; color:${isPrime ? '#ff3333' : '#666'}; border:1px solid ${isPrime ? '#ff3333' : '#444'}; padding:1px 3px; border-radius:2px;">
            ${isPrime ? 'PRIME' : 'COMPOSITE'}
        </span>
      </div>
    `;

    // Properties
    let props = [];
    if (Math.log10(pH) % 1 === 0) props.push(`<span style="color:#00ff00;">Power of 10</span>`);
    if ((pH & (pH - 1)) === 0) props.push(`<span style="color:#aa00ff;">Power of 2</span>`);
    if (Math.sqrt(pH) % 1 === 0) props.push(`<span style="color:#4db8ff;">Perfect Square</span>`);

    if (props.length > 0) {
      html += `<div style="margin-top:4px; font-size:10px; line-height:1.4;">${props.join('<br>')}</div>`;
    } else {
      html += `<div style="margin-top:4px; font-size:10px; color:#444;">No special properties</div>`;
    }

    inspector.innerHTML = html;

    // --- PEARL RENDERING (Overlay) ---
    const scale = camera.renderScale;
    const cx = camera.centerX;
    const cy = camera.centerY;
    const ox = camera.renderOffset.x;
    const oy = camera.renderOffset.y;

    // We need to transform to world space for rendering relative to camera
    ctxOverlay.save();
    ctxOverlay.translate(cx + ox, cy + oy);
    ctxOverlay.scale(scale, scale);

    const xH = cacheX[pH];
    const yH = cacheY[pH];
    const pearlRadius = 8 / scale;

    // 1. Draw K-Neighbourhood (Star Topology)
    ctxOverlay.strokeStyle = "rgba(180, 50, 255, 0.6)"; // Purple Lines
    ctxOverlay.lineWidth = 1.0 / scale;
    ctxOverlay.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctxOverlay.font = `${10 / scale}px monospace`;
    ctxOverlay.textAlign = "center";
    ctxOverlay.textBaseline = "bottom";

    // hoveredNeighbors is global
    if (typeof hoveredNeighbors !== 'undefined' && hoveredNeighbors) {
      for (let nIdx of hoveredNeighbors) {
        if (nIdx === pH) continue;

        const nx = cacheX[nIdx];
        const ny = cacheY[nIdx];

        // Line from Center to Neighbor
        ctxOverlay.beginPath();
        ctxOverlay.moveTo(xH, yH);
        ctxOverlay.lineTo(nx, ny);
        ctxOverlay.stroke();

        // Square Box around Neighbor
        const boxSize = 12 / scale;
        ctxOverlay.strokeStyle = "#ffffff";
        ctxOverlay.lineWidth = 1 / scale;
        ctxOverlay.strokeRect(nx - boxSize / 2, ny - boxSize / 2, boxSize, boxSize);

        // Label: Actual Prime Value (Shift Key Only)
        if (typeof isShiftPressed !== 'undefined' && isShiftPressed) {
          ctxOverlay.fillStyle = "#ffffff";
          ctxOverlay.fillText(nIdx.toString(), nx, ny - boxSize / 2 - (4 / scale));
        }
      }
    }

    // 2. Draw Anchor (Pearl) - P0
    ctxOverlay.beginPath();
    ctxOverlay.arc(xH, yH, pearlRadius, 0, Math.PI * 2);
    ctxOverlay.strokeStyle = "#ffffff";
    ctxOverlay.lineWidth = 2 / scale;
    ctxOverlay.stroke();
    // Glow/Fill
    ctxOverlay.fillStyle = "#ff3333";
    ctxOverlay.fill();

    // Label Center P0 (Shift Only)
    if (typeof isShiftPressed !== 'undefined' && isShiftPressed) {
      ctxOverlay.fillStyle = "#ffffff";
      ctxOverlay.fillText(pH.toString(), xH + pearlRadius * 1.5, yH);
    }

    // "On Hover" Indicator
    const arrowOff = 20 / scale;
    ctxOverlay.fillStyle = "#ffff00";
    ctxOverlay.beginPath();
    ctxOverlay.moveTo(xH + arrowOff, yH + arrowOff);
    ctxOverlay.lineTo(xH + (arrowOff * 0.5), yH + (arrowOff * 0.5));
    ctxOverlay.lineTo(xH + arrowOff, yH + (arrowOff * 0.7));
    ctxOverlay.fill();

    // Springs (Previous/Next)
    const idxInList = primeList.indexOf(pH);
    ctxOverlay.setLineDash([4 / scale, 4 / scale]);
    ctxOverlay.lineWidth = 1 / scale;

    if (idxInList > 0) {
      const prevP = primeList[idxInList - 1];
      ctxOverlay.strokeStyle = "rgba(255, 150, 50, 0.5)";
      ctxOverlay.beginPath();
      ctxOverlay.moveTo(xH, yH);
      ctxOverlay.lineTo(cacheX[prevP], cacheY[prevP]);
      ctxOverlay.stroke();
    }
    if (idxInList < primeList.length - 1) {
      const nextP = primeList[idxInList + 1];
      ctxOverlay.strokeStyle = "rgba(50, 150, 255, 0.5)";
      ctxOverlay.beginPath();
      ctxOverlay.moveTo(xH, yH);
      ctxOverlay.lineTo(cacheX[nextP], cacheY[nextP]);
      ctxOverlay.stroke();
    }
    ctxOverlay.setLineDash([]);

    ctxOverlay.restore();

  } else {
    inspector.innerHTML = `<span style="color:#666;">-- SCANNING --</span>`;
  }

  // Heatmap
  if (heatmapLayer && heatmapLayer.visible) {
    heatmapLayer.render(camera.renderScale, camera.centerX, camera.centerY, camera.renderOffset.x, camera.renderOffset.y, SPACING, sliderR0.value, checkWarp.checked);
  }

  // Detected Fibre Rails (Only if Toggle is Active)
  // Legacy: `detectedFibres.length > 0` was auto-show. Now we require toggle.
  // Wait, user said "no one generates fibres and keeps it hidden".
  // So we will AUTO-ACTIVATE the toggle when fibres are found.
  // But renderRails() should respect the toggle.
  if (detectedFibres.length > 0 && UI.isActive('btn-toggle-extracted')) {
    renderRails();
  }
}

function renderRails() {
  const scale = camera.renderScale;
  const offX = camera.centerX + camera.renderOffset.x;
  const offY = camera.centerY + camera.renderOffset.y;
  const R0 = +sliderR0.value;
  const useWarp = checkWarp.checked;

  const warp = (r) => (r * r) / (r + R0);
  const maxR = Math.sqrt(maxNumber) * SPACING;

  // Utilize thinner lines for precision
  ctxOverlay.lineWidth = 1.0;

  detectedFibres.forEach((f, i) => {
    // Gold for Top-3 (Higher Opacity), Cyan for rest (Lower Opacity)
    ctxOverlay.strokeStyle = i < 3
      ? 'rgba(255, 215, 0, 0.8)' // Gold
      : 'rgba(0, 255, 255, 0.25)'; // Cyan, faint

    ctxOverlay.beginPath();

    if (f.path && f.path.length > 2) {
      // --- CURVED RENDERING ---
      let first = true;
      for (const p of f.path) {
        // p.rNorm is 0..1 relative to maxR
        const rWorld = p.rNorm * maxR;

        // Warp
        const rw = useWarp ? warp(rWorld) : rWorld;

        // Sacks Mapping
        const xWorld = -Math.cos(p.thetaRad) * rw;
        const yWorld = Math.sin(p.thetaRad) * rw;

        const xScreen = xWorld * scale + offX;
        const yScreen = yWorld * scale + offY;

        if (first) {
          ctxOverlay.moveTo(xScreen, yScreen);
          first = false;
        } else {
          ctxOverlay.lineTo(xScreen, yScreen);
        }
      }
    } else {
      // --- FALLBACK: STRAIGHT RAY ---
      const cosT = Math.cos(f.thetaRad);
      const sinT = Math.sin(f.thetaRad);
      const rwMax = useWarp ? warp(maxR) : maxR;

      const xScreen = (-cosT * rwMax) * scale + offX;
      const yScreen = (sinT * rwMax) * scale + offY;

      ctxOverlay.moveTo(offX, offY);
      ctxOverlay.lineTo(xScreen, yScreen);
    }
    ctxOverlay.stroke();
  });
}

// --- FIBRE DETECTOR ---
const fibreDetector = new FibreDetector();
const elFibreList = document.getElementById('fibre-list');
const btnRunDiscovery = document.getElementById('btn-run-discovery-icon'); // New Icon Button
const elDetectorStatus = document.getElementById('detector-status');

// --- POLAR STRIP (GHOST IMAGE) ---
const elPolarPanel = document.getElementById('polar-panel');
const cvsPolar = document.getElementById('polar-strip');
const ctxPolar = cvsPolar.getContext('2d');
const cvsPolarOver = document.getElementById('polar-overlay');
const ctxPolarOver = cvsPolarOver.getContext('2d');
const btnGhost = document.getElementById('btn-toggle-ghost');

class PolarStrip {
  constructor() {
    this.visible = false;

    // Auto-hide initially
    if (elPolarPanel) elPolarPanel.style.display = 'none';

    // Resize observer?
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    if (!elPolarPanel || elPolarPanel.style.display === 'none') return;

    const w = elPolarPanel.clientWidth;
    const h = elPolarPanel.clientHeight - 20; // Title bar
    cvsPolar.width = w;
    cvsPolar.height = h;
    cvsPolarOver.width = w;
    cvsPolarOver.height = h;

    this.render(); // Re-render if data exists
  }

  toggle() {
    this.visible = !this.visible;
    if (elPolarPanel) elPolarPanel.style.display = this.visible ? 'flex' : 'none';
    if (btnGhost) {
      if (this.visible) btnGhost.classList.add('active');
      else btnGhost.classList.remove('active');
    }
    if (this.visible) this.resize();
  }

  render() {
    if (!this.visible || !heatmapLayer.zGrid) return;

    const w = cvsPolar.width;
    const h = cvsPolar.height;
    const grid = heatmapLayer.zGrid;
    const rBins = heatmapLayer.rBins;
    const tBins = heatmapLayer.thetaBins;

    // Draw Heatmap
    const imgData = ctxPolar.createImageData(w, h);
    const data = imgData.data;

    // Map Pixel (x,y) -> Grid (t,r)
    // X is Theta (0..tBins)
    // Y is Radius (0..rBins). Let's put r=0 at bottom? No, top is fine.

    for (let y = 0; y < h; y++) {
      const rIdx = Math.floor((y / h) * rBins);

      for (let x = 0; x < w; x++) {
        const tIdx = Math.floor((x / w) * tBins);

        const idx = rIdx * tBins + tIdx;
        const z = grid[idx];

        // Color Map (Black -> Cyan -> Gold)
        let r = 0, g = 0, b = 0, a = 255;

        if (z < 0.5) { // Noise
          // Fade to black
          const i = Math.floor(z * 20);
          r = i; g = i; b = i;
        } else if (z < 3.0) { // Weak signal
          // Blueish
          b = Math.min(255, 50 + z * 50);
          g = Math.min(255, z * 30);
        } else { // Strong signal
          // Gold/Red
          r = 255;
          g = Math.min(255, (z - 3) * 100); // 3->0, 5->200
          b = 0;
        }

        const pxIdx = (y * w + x) * 4;
        data[pxIdx] = r;
        data[pxIdx + 1] = g;
        data[pxIdx + 2] = b;
        data[pxIdx + 3] = a;
      }
    }
    ctxPolar.putImageData(imgData, 0, 0);

    // Overlay Detected Fibres
    ctxPolarOver.clearRect(0, 0, w, h);
    if (detectedFibres.length > 0) {
      ctxPolarOver.lineWidth = 2;
      ctxPolarOver.strokeStyle = "rgba(255, 255, 0, 0.8)";

      detectedFibres.forEach(f => {
        const x = (f.thetaBin / tBins) * w;
        ctxPolarOver.beginPath();
        ctxPolarOver.moveTo(x, 0);
        ctxPolarOver.lineTo(x, h);
        ctxPolarOver.stroke();

        // Label?
        ctxPolarOver.fillStyle = "#fff";
        ctxPolarOver.font = "10px monospace";
        ctxPolarOver.fillText(f.strength.toFixed(0), x + 2, 10);
      });
    }
  }
}
const polarStrip = new PolarStrip();

// Wire up Ghost Button here (safe from TDZ)
if (btnGhost) btnGhost.onclick = () => polarStrip.toggle();


// Visuals
let detectedFibres = [];
let pendingDiscovery = false;

function runFibreDetection() {
  if (!heatmapLayer.zGrid) {
    if (elDetectorStatus) elDetectorStatus.innerText = "Status: Waiting for Analysis...";
    pendingDiscovery = true;
    triggerAnalysis();
    return;
  }

  // UI Feedback: Start
  if (elDetectorStatus) elDetectorStatus.innerText = "Status: Scanning...";
  if (btnRunDiscovery) btnRunDiscovery.classList.add('spin');

  // Slight delay to allow UI to render
  setTimeout(() => {
    setTimeout(() => {
      // Actual Process
      try {
        detectedFibres = fibreDetector.process(
          heatmapLayer.zGrid,
          heatmapLayer.rBins,
          heatmapLayer.thetaBins
        );

        // UI Feedback: Done
        if (elDetectorStatus) {
          const count = detectedFibres.length;
          elDetectorStatus.innerHTML = `<span style="color:${count > 0 ? '#0f0' : '#888'}">Found <b>${count}</b> Fibres</span>`;
        }

        // Auto-Show Toggle
        const btnExt = document.getElementById('btn-toggle-extracted');
        if (btnExt) {
          btnExt.style.display = 'flex'; // Make visible
          btnExt.classList.add('active'); // Turn ON by default
          // Also update UI Action helper? No need, manual class add is fine.
        }

        renderFibreList();
        requestAnimationFrame(drawOverlay);

      } catch (e) {
        console.error(e);
        if (elDetectorStatus) elDetectorStatus.innerText = "Error during extraction";
      } finally {
        if (btnRunDiscovery) btnRunDiscovery.classList.remove('spin');
      }
    }, 50);
  }, 50);
}

function renderFibreList() {
  if (!elFibreList) return;
  if (detectedFibres.length === 0) {
    elFibreList.innerHTML = '<div style="text-align:center; color:#666;">No Fibres Found</div>';
    return;
  }

  let html = '<table style="width:100%; border-collapse:collapse;">';
  html += '<tr style="color:#888; text-align:left;"><th>#</th><th>Angle</th><th>Str</th></tr>';

  detectedFibres.forEach((f, i) => {
    const deg = (f.thetaRad * 180 / Math.PI).toFixed(1);
    const col = i < 3 ? '#ffcc00' : '#ccc'; // Top 3 gold
    html += `<tr style="color:${col}; border-bottom:1px solid #222; cursor:pointer;" onclick="window.focusFibre(${i})">
            <td>${i + 1}</td>
            <td>${deg}°</td>
            <td>${f.strength.toFixed(0)}</td>
        </tr>`;
  });
  html += '</table>';
  elFibreList.innerHTML = html;
}

// Global hook for list click
window.focusFibre = function (idx) {
  console.log("Selected Fibre:", detectedFibres[idx]);
  // TODO: Snap?
};

if (btnRunDiscovery) btnRunDiscovery.addEventListener('click', runFibreDetection);

// --- WORKER INLINING (Fix for file:// access) ---
const workerBlob = new Blob([`
/**
 * Analysis Worker for Prime Spiral
 * 
 * Computes Polar Density Grid and Z-Scores in background.
 */
self.onmessage = function (e) {
    const { maxNumber, minNumber, rBins, thetaBins } = e.data; // Added minNumber

    console.log(\`[Worker] Starting Analysis: Range [\${minNumber} .. \${maxNumber}], Grid=\${rBins}x\${thetaBins}\`);
    const start = performance.now();
    
    try {
        // 1. Sieve Primes
        const primeMap = new Uint8Array(maxNumber + 1);
        primeMap.fill(1);
        primeMap[0] = 0;
        primeMap[1] = 0;
        for (let i = 2; i * i <= maxNumber; i++) {
            if (primeMap[i]) {
                for (let j = i * i; j <= maxNumber; j += i) primeMap[j] = 0;
            }
        }

        // 2. Initialize Bins
        const totalBins = rBins * thetaBins;

        // 3. Binning Loop (Single Pass)
        const primeCounts = new Int32Array(totalBins);
        const expCounts = new Float32Array(totalBins);
        const zGrid = new Float32Array(totalBins);
        const maxR = Math.sqrt(maxNumber);
        const PI2 = Math.PI * 2;
        let maxZ = 0; 

        // Start from minNumber (or 2 if min < 2)
        const startN = Math.max(2, minNumber || 2);

        for (let n = startN; n <= maxNumber; n++) {
            const root = Math.sqrt(n);
            const theta = (root * PI2) % PI2; // 0 to 2PI

            // Map to bins
            let rIdx = Math.floor((root / maxR) * rBins);
            if (rIdx >= rBins) rIdx = rBins - 1;

            let tIdx = Math.floor((theta / PI2) * thetaBins);
            if (tIdx >= thetaBins) tIdx = thetaBins - 1;

            const binIdx = rIdx * thetaBins + tIdx;

            if (primeMap[n]) primeCounts[binIdx]++;
            expCounts[binIdx] += 1.0 / Math.log(n);
        }

        // 4. Calculate Z-Scores
        for (let i = 0; i < totalBins; i++) {
            const obs = primeCounts[i];
            const exp = expCounts[i];
            if (exp > 0.001) {
                zGrid[i] = (obs - exp) / Math.sqrt(exp);
            }
        }

        // --- SMOOTHING (Gaussian Kernel [0.25, 0.5, 0.25]) ---
        // Smooth along Theta axis to reduce aliasing noise
        const smoothedZ = new Float32Array(totalBins);
        
        for(let r=0; r<rBins; r++) {
            for(let t=0; t<thetaBins; t++) {
                 const idx = r * thetaBins + t;
                 
                 // Wrap indices
                 const tLeft = (t - 1 + thetaBins) % thetaBins;
                 const tRight = (t + 1) % thetaBins;
                 
                 const idxLeft = r * thetaBins + tLeft;
                 const idxRight = r * thetaBins + tRight;
                 
                 const val = zGrid[idx] * 0.5 + zGrid[idxLeft] * 0.25 + zGrid[idxRight] * 0.25;
                 smoothedZ[idx] = val;
                 if(val > maxZ) maxZ = val; // Re-track max
            }
        }
        
        // Copy back
        zGrid.set(smoothedZ);

        const time = performance.now() - start;
        console.log(\`[Worker] Analysis Complete: MaxZ=\${maxZ.toFixed(2)} in \${time.toFixed(0)}ms\`);

        self.postMessage({
            type: 'RESULT',
            zGrid: zGrid,
            maxZ: maxZ,
            rBins,
            thetaBins,
            maxR
        }, [zGrid.buffer]);

    } catch (err) {
        console.error("[Worker] Error:", err);
        self.postMessage({ type: 'ERROR', message: err.message });
    }
};
`], { type: 'application/javascript' });

// --- INIT ---
const heatmapLayer = new HeatmapLayer(ctxOverlay);
let analysisWorker = null;
try {
  // Use Blob URL instead of file path
  const workerUrl = URL.createObjectURL(workerBlob);
  analysisWorker = new Worker(workerUrl);
  analysisWorker.onmessage = (e) => {
    if (e.data.type === 'RESULT') {
      heatmapLayer.updateData(e.data.zGrid, e.data.maxZ, e.data.rBins, e.data.thetaBins, e.data.maxR);
      requestAnimationFrame(drawOverlay);

      // Update Button State
      if (typeof btnRunDiscovery !== 'undefined' && btnRunDiscovery) {
        btnRunDiscovery.classList.remove('spin');
        // Actually style default is #888, active is #fff or color.
        // Let's remove inline style to revert to class, or set to a "Ready" color?
        btnRunDiscovery.style.color = ""; // Reset
      }

      if (elDetectorStatus) elDetectorStatus.innerText = "Status: Analysis Ready";

      // Resume Detection if Pending
      if (pendingDiscovery) {
        pendingDiscovery = false;
        runFibreDetection();
      }
    }
  }
} catch (e) {
  console.error("Worker Init Failed:", e);
  alert("Analysis Worker Failed. Please check console.");
}

function triggerAnalysis() {
  if (analysisWorker) {
    // DYNAMIC RESOLUTION SCALING (High Precision Update)
    // We target higher angular resolution for smooth fibre tracing.

    // Target Density: bins should be fine enough to separate local peaks.
    // Total Bins = N / 4.
    const targetDensity = 4.0;
    const totalBinsTarget = maxNumber / targetDensity;

    // Angular Resolution is critical for "wobble" reduction.
    let tBins = 720;
    if (maxNumber > 500000) tBins = 1440;
    if (maxNumber > 2000000) tBins = 2880;
    if (maxNumber > 5000000) tBins = 4096;

    // Calculate rBins to meet target density
    let rBins = Math.floor(totalBinsTarget / tBins);

    // Clamps
    if (rBins < 256) rBins = 256;
    if (rBins > 4096) rBins = 4096;

    console.log(`[Analysis] Triggering: N=${maxNumber.toLocaleString()} -> Grid ${rBins}x${tBins}`);

    // UI Feedback
    if (typeof elDetectorStatus !== 'undefined' && elDetectorStatus) elDetectorStatus.innerText = "Status: Computing via WASM...";
    if (typeof btnRunDiscovery !== 'undefined' && btnRunDiscovery) btnRunDiscovery.classList.add('spin');

    // Call WASM
    // Use setTimeout to allow UI to render the "Computing" state
    setTimeout(async () => {
      try {
        if (window.wasmEngine && window.wasmEngine.isReady) {
          const zGrid = await window.wasmEngine.getDensityMap(maxNumber, rBins, tBins);
          if (zGrid) {
            // Find MaxZ for normalization (C# didn't return it, so we calc fast here or just iterate)
            let maxZ = 0;
            for (let val of zGrid) if (val > maxZ) maxZ = val;
            const maxR = Math.sqrt(maxNumber);

            heatmapLayer.updateData(zGrid, maxZ, rBins, tBins, maxR);
            requestAnimationFrame(drawOverlay);

            if (elDetectorStatus) elDetectorStatus.innerText = "Status: Analysis Ready";
          }
        } else {
          console.error("WASM Engine not ready");
        }
      } catch (e) {
        console.error("WASM Density Error", e);
      } finally {
        if (typeof btnRunDiscovery !== 'undefined' && btnRunDiscovery) btnRunDiscovery.classList.remove('spin');
      }
    }, 10);
  }
}

// --- STATE MANAGER ---
const StateManager = {
  save: () => {
    const state = {
      version: 1,
      maxNumber: maxNumber,
      camera: {
        ox: camera.offsetX,
        oy: camera.offsetY,
        scale: camera.scale
      },
      settings: {
        grid: checkGrid.checked,
        debug: checkDebug.checked,
        sq: checkSq.checked,
        p2: checkPow2.checked,
        p10: checkPow10.checked,
        warp: checkWarp.checked,
        r0: sliderR0.value,
        flux: checkFlux.checked,
        euler: toggleEuler.checked,
        legendre: toggleLegendre.checked,
        heatmap: checkHeatmap.checked
      }
    };
    try {
      localStorage.setItem('prime_spiral_state_v1', JSON.stringify(state));
    } catch (e) { }
  },

  load: () => {
    try {
      const raw = localStorage.getItem('prime_spiral_state_v1');
      if (!raw) return;
      const state = JSON.parse(raw);

      if (state.maxNumber && !isNaN(state.maxNumber)) maxNumber = state.maxNumber;

      if (state.camera) {
        camera.offsetX = state.camera.ox;
        camera.offsetY = state.camera.oy;
        camera.scale = state.camera.scale;

        // Sync target/render states
        camera.targetOffsetX = state.camera.ox;
        camera.targetOffsetY = state.camera.oy;
        camera.targetScale = state.camera.scale;
        camera.renderOffset.x = state.camera.ox;
        camera.renderOffset.y = state.camera.oy;
        camera.renderScale = state.camera.scale;
      }

      if (state.settings) {
        // Helper to set button state
        const setBtnState = (id, active) => {
          const el = document.getElementById(id);
          if (el) {
            if (active) el.classList.add('active');
            else el.classList.remove('active');
          }
        };

        if (state.settings.grid !== undefined) setBtnState('btn-toggle-grid', state.settings.grid);
        if (state.settings.debug !== undefined) checkDebug.checked = state.settings.debug;
        if (state.settings.sq !== undefined) setBtnState('btn-toggle-sq', state.settings.sq);
        if (state.settings.p2 !== undefined) setBtnState('btn-toggle-pow2', state.settings.p2);
        if (state.settings.p10 !== undefined) setBtnState('btn-toggle-pow10', state.settings.p10);
        if (state.settings.flux !== undefined) setBtnState('btn-toggle-flux', state.settings.flux);
        if (state.settings.euler !== undefined) setBtnState('btn-toggle-fiber-euler', state.settings.euler);
        if (state.settings.legendre !== undefined) setBtnState('btn-toggle-fiber-legendre', state.settings.legendre);
        if (state.settings.heatmap !== undefined && checkHeatmap) checkHeatmap.checked = state.settings.heatmap;
        if (state.settings.warp !== undefined && checkWarp) checkWarp.checked = state.settings.warp;

        if (state.settings.r0 !== undefined) {
          sliderR0.value = state.settings.r0;
          if (elR0) elR0.innerText = state.settings.r0;
        }
      }
    } catch (e) {
      console.warn("State restore failed", e);
    }
  }
};

window.addEventListener('beforeunload', () => StateManager.save());

function init() {
  StateManager.load(); // Restore state before init
  allocateBuffers(maxNumber);
  initPrimes();
  resize();
  window.addEventListener('resize', resize);
  document.getElementById('loading').style.display = 'none';
}

// Listeners for sliders/other controls
sliderR0.addEventListener('input', (e) => {
  if (elR0) elR0.innerText = e.target.value;
  updateWarpGraph();
  requestAnimationFrame(drawOverlay);
});
checkHeatmap.addEventListener('change', () => { // Heatmap is still a checkbox in sidebar? Yes.
  if (heatmapLayer) heatmapLayer.visible = checkHeatmap.checked;
  requestAnimationFrame(drawOverlay);
});
checkWarp.addEventListener('change', () => {
  requestAnimationFrame(drawOverlay);
  updateWarpGraph();
});

// --- NAVIGATION ACTIONS ---
const elDispZoom = document.getElementById('disp-zoom-level');
const btnFit = document.getElementById('btn-fit');
const btnFastZoom = document.getElementById('btn-zoom-fast');

function actionFit() {
  const maxR = Math.sqrt(maxNumber) * SPACING; // Maximum radius of spiral
  // We want to fit 2*maxR either in width or height
  const pad = 1.1; // 10% padding
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const minDim = Math.min(w, h);

  const targetScale = minDim / (2 * maxR * pad);

  camera.targetScale = targetScale;
  camera.targetOffsetX = 0;
  camera.targetOffsetY = 0; // Center
  requestAnimationFrame(draw);
}

function actionFastZoom() {
  // Reset to 1:1 or a "Standard" Zoom
  camera.targetScale = 1.0;
  camera.targetOffsetX = 0;
  camera.targetOffsetY = 0;
  requestAnimationFrame(draw);
}

if (btnFit) btnFit.onclick = actionFit;
if (btnFastZoom) btnFastZoom.onclick = actionFastZoom;

// --- RENDER ---
function draw(timestamp) {
  const start = performance.now();

  // UPDATE CAMERA
  const isMoving = camera.update();
  if (isMoving) requestAnimationFrame(draw);

  // Sync Zoom Level Text
  if (elDispZoom) {
    // Show as float with 2 decimal places? or X factor?
    // User said "as a number".
    elDispZoom.innerText = camera.scale.toFixed(2);
  }

  // Apply Stability
  const stabilityActive = document.getElementById('toggle-stability') ? document.getElementById('toggle-stability').checked : false;
  if (stabilityActive) {
    camera.applyEffect('SCALE', 0.05);
    requestAnimationFrame(draw); // Keep animating
  }

  // Use Render State from Camera
  const scale = camera.renderScale;
  const cx = camera.centerX;
  const cy = camera.centerY;
  const ox = camera.renderOffset.x;
  const oy = camera.renderOffset.y;
  const W = canvas.width / (window.devicePixelRatio || 1);
  const H = canvas.height / (window.devicePixelRatio || 1);

  // Bounds
  const tl = camera.screenToWorld(0, 0);
  const br = camera.screenToWorld(W, H);

  const query = grid.query(tl.x, tl.y, br.x, br.y);
  const visibleChunks = query.chunks;
  const count = query.count;

  // Strategy
  let strategy = 'VECTOR';
  if (scale < 0.2 || count > SAFETY_LIMIT) strategy = 'PIXEL';

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(cx + ox, cy + oy);
  ctx.scale(scale, scale);

  const dotSize = 1.2 / scale;

  if (strategy === 'VECTOR') {
    const isP10 = checkPow10.checked;
    const isP2 = checkPow2.checked;
    const isSq = checkSq.checked;

    ctx.fillStyle = "#ff3333";
    ctx.beginPath();
    for (const chunk of visibleChunks) {
      for (let i of chunk) {
        if (primeMap[i] === 1) {
          ctx.rect(cacheX[i] - dotSize / 2, cacheY[i] - dotSize / 2, dotSize, dotSize);
        }
      }
    }
    ctx.fill();

    // Special points are now handled in Layer 2 (Global Lists) for performance.

  } else {
    // Pixel Mode - Hyper Optimized (Bit-Blit)
    // 1. Get Prime Only chunks
    const pQuery = grid.queryPrimes(tl.x, tl.y, br.x, br.y);

    // 2. Prepare Buffer
    // USE PHYSICAL DIMENSIONS for ImageData (Bit-Blit works in device pixels)
    const dpr = window.devicePixelRatio || 1;
    const iW = canvas.width; // Physical
    const iH = canvas.height; // Physical
    const imgData = ctx.createImageData(iW, iH);
    const buf32 = new Uint32Array(imgData.data.buffer);

    // 3. Blit
    // Color: Red (ABGR = 0xFF0000FF)
    const COLOR = 0xFF0000FF;
    // Background: #0d0d0d (ABGR = 0xFF0d0d0d)
    const BG_COLOR = 0xFF0d0d0d;

    // Fill background (Robust clear + solid color)
    buf32.fill(BG_COLOR);

    // Pre-calc transforms (Logical -> Physical)
    const offX = cx + ox;
    const offY = cy + oy;

    for (const chunk of pQuery.chunks) {
      for (let i of chunk) {
        // Project to Screen (Logical) then scale to Physical (DPR)
        // x_phy = (worldX * scale + offX) * dpr
        const sx = ((cacheX[i] * scale + offX) * dpr) | 0;
        const sy = ((cacheY[i] * scale + offY) * dpr) | 0;

        if (sx >= 0 && sx < iW && sy >= 0 && sy < iH) {
          buf32[sy * iW + sx] = COLOR;
        }
      }
    }

    // Put at (0,0) (Physical)
    // Note: putImageData ignores context transform, so it works directly in device pixels.
    // However, our ctx might be scaled? putImageData resets to device coords.
    ctx.putImageData(imgData, 0, 0);
  }

  // LAYER 2: Special Points (Silver/Green/Purple) - Always drawn ON TOP
  // Precedence: Purple > Green > Silver
  // Draw Order: Silver -> Green -> Purple

  const isP10 = checkPow10.checked;
  const isP2 = checkPow2.checked;
  const isSq = checkSq.checked;

  // 3 Screen Pixels Minimum size for visibility
  const specialSize = 3 / scale;

  if (isSq) {
    ctx.fillStyle = "#C0C0C0"; // Silver
    ctx.strokeStyle = "#C0C0C0";
    ctx.lineWidth = Math.max(1, 2 / scale); // Keep visible

    // Feature: Render as solid line if zoomed out
    if (scale < 0.5) {
      // Find furthest square
      const maxRoot = Math.floor(Math.sqrt(maxNumber));
      const lastSq = maxRoot * maxRoot;

      ctx.beginPath();
      ctx.moveTo(cacheX[1], cacheY[1]); // Start at 1
      ctx.lineTo(cacheX[lastSq], cacheY[lastSq]); // End at max
      ctx.stroke();
    } else {
      // Render points
      for (let i of sqList) {
        if (i > maxNumber) break;
        if (i < minNumber) continue; // HOLLOW
        const x = cacheX[i];
        const y = cacheY[i];
        if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) {
          ctx.fillRect(x - specialSize / 2, y - specialSize / 2, specialSize, specialSize);
        }
      }
    }
  }

  if (isP10) {
    ctx.fillStyle = "#00ff00";
    for (let i of p10List) {
      if (i > maxNumber) break;
      if (i < minNumber) continue; // HOLLOW
      const x = cacheX[i];
      const y = cacheY[i];
      // Bounds Check
      if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) {
        ctx.fillRect(x - specialSize / 2, y - specialSize / 2, specialSize, specialSize);
      }
    }
  }

  if (isP2) {
    ctx.fillStyle = "#aa00ff"; // Purple
    for (let i of p2List) {
      if (i > maxNumber) break;
      if (i < minNumber) continue; // HOLLOW
      const x = cacheX[i];
      const y = cacheY[i];
      if (x >= tl.x && x <= br.x && y >= tl.y && y <= br.y) {
        ctx.fillRect(x - specialSize / 2, y - specialSize / 2, specialSize, specialSize);
      }
    }
  }

  ctx.restore();

  // Stats
  if (elVisible) elVisible.innerText = count.toLocaleString();
  if (elRenderTime) elRenderTime.innerText = (performance.now() - start).toFixed(1) + "ms";
  if (elStrategy) elStrategy.innerText = strategy;

  // HUD
  if (dbgZoom) dbgZoom.innerText = scale.toFixed(4);
  if (dbgVisibleCount) dbgVisibleCount.innerText = count.toLocaleString();
  if (dbgStrategyVal) dbgStrategyVal.innerText = strategy;
  if (dbgOffset) dbgOffset.innerText = `${ox.toFixed(0)}, ${oy.toFixed(0)}`;
  if (dbgMin) dbgMin.innerText = `${tl.x.toFixed(1)}, ${tl.y.toFixed(1)}`;
  if (dbgMax) dbgMax.innerText = `${br.x.toFixed(1)}, ${br.y.toFixed(1)}`;

  // Sync Overlay (Fibres/Heatmap) with current frame
  drawOverlay();


}

// --- UI SETUP (Moved from index.html) ---
function setupUI() {
  // --- MIN NUMBER ---
  const inpMin = document.getElementById('inp-min');

  function formatNumber(num) {
    return num.toLocaleString();
  }
  function parseNumber(str) {
    return parseInt(str.replace(/,/g, ''), 10) || 0;
  }

  function updateMinUI() {
    if (inpMin) inpMin.value = formatNumber(minNumber);
    if (window.updateMinNumber) window.updateMinNumber(minNumber); // This is defined where? in index? No, actually window.updateMinNumber was calls to spiral.. wait. 
    // Actually spiral.js IS where updateMinNumber/updateMaxNumber logic resides usually.
    // If those were defined in spiral.js properly, we can call them directly.
    if (typeof updateMinNumber === 'function') updateMinNumber(minNumber);
  }

  if (inpMin) {
    // Init
    inpMin.value = formatNumber(minNumber);

    document.getElementById('btn-dec-min-1k')?.addEventListener('click', () => {
      minNumber = Math.max(0, minNumber - 1000);
      updateMinUI();
    });
    document.getElementById('btn-dec-min-100')?.addEventListener('click', () => {
      minNumber = Math.max(0, minNumber - 100);
      updateMinUI();
    });
    document.getElementById('btn-inc-min-100')?.addEventListener('click', () => {
      minNumber += 100;
      updateMinUI();
    });
    document.getElementById('btn-inc-min-1k')?.addEventListener('click', () => {
      minNumber += 1000;
      updateMinUI();
    });
    inpMin.addEventListener('change', () => {
      let val = parseNumber(inpMin.value);
      if (val < 0) val = 0;
      minNumber = val;
      updateMinUI();
    });
  }

  // --- MAX NUMBER ---
  const inpMax = document.getElementById('inp-max');
  if (inpMax) {
    // Init
    inpMax.value = formatNumber(maxNumber);

    function updateMaxUI() {
      inpMax.value = formatNumber(maxNumber);
      if (typeof updateMaxNumber === 'function') updateMaxNumber(maxNumber);
    }

    document.getElementById('btn-dec-100k')?.addEventListener('click', () => {
      maxNumber = Math.max(1000, maxNumber - 100000);
      updateMaxUI();
    });
    document.getElementById('btn-dec-10k')?.addEventListener('click', () => {
      maxNumber = Math.max(1000, maxNumber - 10000);
      updateMaxUI();
    });
    document.getElementById('btn-inc-10k')?.addEventListener('click', () => {
      maxNumber += 10000;
      updateMaxUI();
    });
    document.getElementById('btn-inc-100k')?.addEventListener('click', () => {
      maxNumber += 100000;
      updateMaxUI();
    });
  }
}

// Start
init();
setupUI();

