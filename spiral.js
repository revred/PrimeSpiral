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
});

// --- Data Store ---
let primeMap;
let cacheX;
let cacheY;
let maxNumber = 2000000;
const SPACING = 1;
const CHUNK_SIZE = 100;
const SAFETY_LIMIT = 50000;

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
  }
}
const profiler = new Profiler(); // Placeholder for now to reduce noise

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

const checkGrid = document.getElementById('toggle-grid');
const checkDebug = document.getElementById('toggle-debug');
const checkSq = document.getElementById('toggle-sq');
const checkPow2 = document.getElementById('toggle-pow2');
const checkPow10 = document.getElementById('toggle-pow10');
const checkFiberEuler = document.getElementById('toggle-fiber-euler');
const checkFiberLegendre = document.getElementById('toggle-fiber-legendre');
const checkWarp = document.getElementById('toggle-warp');
const sliderR0 = document.getElementById('warp-r0');
const elR0 = document.getElementById('disp-r0');

// --- GRID ---
class SpiralGrid {
  constructor() {
    this.chunks = new Map();
    this.primeChunks = new Map();
    this.minX = 0; this.maxX = 0;
    this.minY = 0; this.maxY = 0;
  }

  clear() {
    this.chunks.clear();
    this.primeChunks.clear();
  }

  get bounds() {
    return {
      minX: this.minX,
      maxX: this.maxX,
      minY: this.minY,
      maxY: this.maxY
    };
  }

  build() {
    this.clear();
    const tempBuffer = new Map();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (let i = 0; i <= maxNumber; i++) {
      const x = cacheX[i];
      const y = cacheY[i];

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      const kx = Math.floor(x / CHUNK_SIZE);
      const ky = Math.floor(y / CHUNK_SIZE);
      const key = (ky << 16) | (kx & 0xFFFF);

      let list = tempBuffer.get(key);
      if (!list) {
        list = [];
        tempBuffer.set(key, list);
      }
      list.push(i);
    }

    this.minX = minX; this.maxX = maxX;
    this.minY = minY; this.maxY = maxY;

    for (const [key, list] of tempBuffer) {
      this.chunks.set(key, new Int32Array(list));

      // Filter for Primes Only
      const pList = [];
      for (let id of list) {
        if (primeMap[id]) pList.push(id);
      }
      if (pList.length > 0) this.primeChunks.set(key, new Int32Array(pList));
    }
  }

  query(rLeft, rTop, rRight, rBottom) {
    const startKX = Math.floor(rLeft / CHUNK_SIZE);
    const endKX = Math.floor(rRight / CHUNK_SIZE);
    const startKY = Math.floor(rTop / CHUNK_SIZE);
    const endKY = Math.floor(rBottom / CHUNK_SIZE);

    const results = [];
    let totalPoints = 0;

    for (let ky = startKY; ky <= endKY; ky++) {
      for (let kx = startKX; kx <= endKX; kx++) {
        const key = (ky << 16) | (kx & 0xFFFF);
        const chunk = this.chunks.get(key);
        if (chunk) {
          results.push(chunk);
          totalPoints += chunk.length;
        }
      }
    }
    return { chunks: results, count: totalPoints };
  }

  queryPrimes(rLeft, rTop, rRight, rBottom) {
    const startKX = Math.floor(rLeft / CHUNK_SIZE);
    const endKX = Math.floor(rRight / CHUNK_SIZE);
    const startKY = Math.floor(rTop / CHUNK_SIZE);
    const endKY = Math.floor(rBottom / CHUNK_SIZE);

    const results = [];
    let totalPoints = 0;

    for (let ky = startKY; ky <= endKY; ky++) {
      for (let kx = startKX; kx <= endKX; kx++) {
        const key = (ky << 16) | (kx & 0xFFFF);
        const chunk = this.primeChunks.get(key);
        if (chunk) {
          results.push(chunk);
          totalPoints += chunk.length;
        }
      }
    }
    return { chunks: results, count: totalPoints };
  }
}

const grid = new SpiralGrid();

// --- CORE LOGIC ---
function allocateBuffers(max) {
  maxNumber = max;
  primeMap = new Uint8Array(maxNumber + 1);
  cacheX = new Float32Array(maxNumber + 1);
  cacheY = new Float32Array(maxNumber + 1);
  if (fiberManager && fiberManager.init) fiberManager.init(max);
}

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
  for (let i = 0; i <= maxNumber; i++) {
    const root = Math.sqrt(i);
    const r = root * SPACING;
    const theta = root * PI2;
    const rw = useWarp ? warpR(r, R0) : r;
    cacheX[i] = -Math.cos(theta) * rw;
    cacheY[i] = Math.sin(theta) * rw;
  }

  grid.build();
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
}

function drawOverlay() {
  // Use Physical Clear (Robust)
  const dpr = window.devicePixelRatio || 1;
  ctxOverlay.save();
  ctxOverlay.setTransform(1, 0, 0, 1, 0, 0); // Identity
  ctxOverlay.clearRect(0, 0, canvasOverlay.width, canvasOverlay.height);
  ctxOverlay.restore(); // Restore dpr scale set in resize()

  // Hover Logic

  const mx = window.mouseWorldX;
  const my = window.mouseWorldY;
  let hovered = -1;
  const hoverThreshold = 5 / camera.renderScale; // 5 screen pixels tolerance

  // Only scan if we are not moving too fast or if user paused?
  // Scan visible chunks
  // Optimization: Only scan if mouse is inside bounds
  const tl = camera.screenToWorld(0, 0);
  const br = camera.screenToWorld(canvas.width, canvas.height);

  if (mx >= tl.x && mx <= br.x && my >= tl.y && my <= br.y) {
    const query = grid.query(mx - hoverThreshold, my - hoverThreshold, mx + hoverThreshold, my + hoverThreshold);
    // Actually, simple proximity check on visible chunks from draw() might be enough if we cached them?
    // Let's re-query small area around mouse for speed (O(1)) instead of O(N_visible)
    // The grid query above is fast.

    // We need to re-query grid because draw() query might be stale or different scope? 
    // Actually reusing grid is fine.

    let minDist = hoverThreshold * hoverThreshold;

    for (const chunk of query.chunks) {
      for (let i of chunk) {
        // Check prime or interesting points
        // Note: cacheX/Y are center points.
        const dx = cacheX[i] - mx;
        const dy = cacheY[i] - my;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          hovered = i;
        }
      }
    }
  }

  const inspector = document.getElementById('inspector-content');
  if (hovered !== -1) {
    const isPrime = primeMap[hovered] === 1;

    // Build Inspector HTML
    let html = `
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <span style="font-size:18px; color:#fff; font-weight:bold;">${hovered.toLocaleString()}</span>
        <span style="font-size:10px; color:${isPrime ? '#ff3333' : '#666'}; border:1px solid ${isPrime ? '#ff3333' : '#444'}; padding:1px 3px; border-radius:2px;">
            ${isPrime ? 'PRIME' : 'COMPOSITE'}
        </span>
      </div>
    `;

    // Properties
    let props = [];
    if (Math.log10(hovered) % 1 === 0) props.push(`<span style="color:#00ff00;">Power of 10</span>`);
    if ((hovered & (hovered - 1)) === 0) props.push(`<span style="color:#aa00ff;">Power of 2</span>`);
    if (Math.sqrt(hovered) % 1 === 0) props.push(`<span style="color:#4db8ff;">Perfect Square</span>`);

    if (props.length > 0) {
      html += `<div style="margin-top:4px; font-size:10px; line-height:1.4;">${props.join('<br>')}</div>`;
    } else {
      html += `<div style="margin-top:4px; font-size:10px; color:#444;">No special properties</div>`;
    }

    inspector.innerHTML = html;

    // Highlight hovered point
    ctxOverlay.strokeStyle = "#fff";
    ctxOverlay.lineWidth = 2;
    // Crosshair
    const s = camera.worldToScreen(cacheX[hovered], cacheY[hovered]);
    ctxOverlay.beginPath();
    ctxOverlay.moveTo(s.x - 10, s.y); ctxOverlay.lineTo(s.x + 10, s.y);
    ctxOverlay.moveTo(s.x, s.y - 10); ctxOverlay.lineTo(s.x, s.y + 10);
    ctxOverlay.stroke();

  } else {
    inspector.innerHTML = `<span style="color:#666;">-- SCANNING --</span>`;
  }

  // Heatmap
  if (heatmapLayer && heatmapLayer.visible) {
    heatmapLayer.render(camera.renderScale, camera.centerX, camera.centerY, camera.renderOffset.x, camera.renderOffset.y, SPACING, sliderR0.value, checkWarp.checked);
  }
}

// --- INIT ---
const heatmapLayer = new HeatmapLayer(ctxOverlay);
let analysisWorker = null;
try {
  analysisWorker = new Worker('analysis_worker.js');
  analysisWorker.onmessage = (e) => {
    if (e.data.type === 'RESULT') {
      heatmapLayer.updateData(e.data.zGrid, e.data.maxZ, e.data.rBins, e.data.thetaBins, e.data.maxR);
      requestAnimationFrame(drawOverlay);
    }
  }
} catch (e) { }

function triggerAnalysis() {
  if (analysisWorker) analysisWorker.postMessage({ maxNumber, rBins: 1000, thetaBins: 720 });
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
        r0: sliderR0.value
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
        if (state.settings.grid !== undefined) checkGrid.checked = state.settings.grid;
        if (state.settings.debug !== undefined) checkDebug.checked = state.settings.debug;
        if (state.settings.sq !== undefined) checkSq.checked = state.settings.sq;
        if (state.settings.p2 !== undefined) checkPow2.checked = state.settings.p2;
        if (state.settings.p10 !== undefined) checkPow10.checked = state.settings.p10;
        if (state.settings.warp !== undefined) checkWarp.checked = state.settings.warp;

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

// Wire up basics
sliderR0.addEventListener('input', () => {
  elR0.innerText = sliderR0.value;
  setTimeout(updateCache, 50);
});

// Start
init();
