/**
 * HIGH PERFORMANCE PRIME SPIRAL (SACKS)
 * 
 * ARCHITECTURE:
 * - Spatial Partitioning (SpiralGrid): World divided into 100x100 chunks.
 * - Hybrid Rendering with Auto-LOD: 
 *      - PIXEL MODE: Used when > 60k nodes visible OR zoomed out.
 *      - VECTOR MODE: Used only when safe (< 60k nodes).
 * - Debugging: Visualization of spatial chunks.
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const canvasOverlay = document.getElementById('canvas-overlay');
const ctxOverlay = canvasOverlay.getContext('2d');
const infoPanel = document.getElementById('info-content');
const warpGraph = document.getElementById('warp-graph');
const ctxGraph = warpGraph.getContext('2d');

// --- UI Stats ---
const elMax = document.getElementById('inp-max');
const elVisible = document.getElementById('disp-visible');
const elFps = document.getElementById('disp-fps');
const elRenderTime = document.getElementById('disp-render-time');
const elStrategy = document.getElementById('disp-strategy');

const checkGrid = document.getElementById('toggle-grid');
const checkDebug = document.getElementById('toggle-debug');
const checkSq = document.getElementById('toggle-sq');
const checkPow2 = document.getElementById('toggle-pow2');
const checkPow10 = document.getElementById('toggle-pow10');
const checkWarp = document.getElementById('toggle-warp');
const sliderR0 = document.getElementById('warp-r0');
const elR0 = document.getElementById('disp-r0');

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

// --- Expose for Automation ---
window.mouseWorldX = 0;
window.mouseWorldY = 0;
window.hoveredNumber = -1;
window.cacheX = null;
window.cacheY = null;
window.scale = 15;

// --- View State ---
let scale = 15;
let offsetX = 0;
let offsetY = 0;
let width, height;
let centerX, centerY;

// Smooth Camera Targets
let targetScale = 15;
let targetOffsetX = 0;
let targetOffsetY = 0;

window.offsetX = 0;
window.offsetY = 0;
window.centerX = 0;
window.centerY = 0;
window.zoom = 15;

// --- Mouse State ---
let isDragging = false;
let lastX = 0, lastY = 0;
let mouseWorldX = 0, mouseWorldY = 0;
let hoveredNumber = -1;

// --- Telemetry ---
let lastFrameTime = 0;
let frameCount = 0;
let lastFpsUpdate = 0;

// --- Data Store ---
let primeMap;
let cacheX;
let cacheY;
let maxNumber = 2000000;
const SPACING = 1;
const CHUNK_SIZE = 100;
const SAFETY_LIMIT = 50000;

// Pre-renders the entire spiral to an offscreen canvas for GPU-accelerated transforms
let spriteCache = null;
let spriteCacheValid = false;
let spriteCacheMaxNumber = 0;
let spriteCacheBounds = null;
// --- SPRITE SYSTEM (REMOVED: Now using Direct-to-Canvas for crispness) ---
function buildSpriteCache() { return true; }
function invalidateSpriteCache() { }

function allocateBuffers(max) {
  maxNumber = max;
  primeMap = new Uint8Array(maxNumber + 1);
  cacheX = new Float32Array(maxNumber + 1);
  cacheY = new Float32Array(maxNumber + 1);
  window.cacheX = cacheX;
  window.cacheY = cacheY;
  invalidateSpriteCache();
}
allocateBuffers(2000000);

// --- Assets ---
let noiseTexture = null;
function createNoiseTexture() {
  if (noiseTexture) return noiseTexture;
  const size = CHUNK_SIZE;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const cx = c.getContext('2d', { alpha: false });

  cx.fillStyle = "#0d0d0d";
  cx.fillRect(0, 0, size, size);

  const imgData = cx.createImageData(size, size);
  const buf = new Uint32Array(imgData.data.buffer);
  const COL_COMP = 0xFF313131;

  for (let i = 0; i < buf.length; i++) {
    if (Math.random() < 0.8) buf[i] = COL_COMP;
    else buf[i] = 0xFF0D0D0D;
  }

  cx.putImageData(imgData, 0, 0);
  noiseTexture = c;
  return c;
}

// --- Profiler ---
const btnProfile = document.getElementById('btn-profile');
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
    if (elProfileResults) elProfileResults.innerText = "Profiling... (Interact to test responsiveness)";
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

    window.lastProfileData = {
      "FPS": 1000 / avg,
      "RenderPixel": avg,
      "MaxBatch": maxBatch
    };

    let msg = `Results:\n`;
    msg += `Avg Frame Time: ${avg.toFixed(2)}ms (~${(1000 / avg).toFixed(0)} FPS)\n`;
    msg += `Max Main Thread Block: ${maxBatch.toFixed(2)}ms\n`;
    msg += `Avg Batch Block: ${avgBatch.toFixed(2)}ms\n`;
    msg += `Details:\n${metricsMsg}`;

    if (maxBatch > 16) msg += `WARNING: Main thread blocked > 16ms!\n`;
    else msg += `PASS: Responsiveness maintained.\n`;

    if (elProfileResults) elProfileResults.innerText = msg;
    console.log("Profile Complete");
  }
}

const profiler = new Profiler();
window.startProfile = (durationMs) => {
  if (window.profiler.active) return;
  window.profiler.start(durationMs);
  currentJobId++;
  requestAnimationFrame(draw);
};

window.profiler = profiler;
if (btnProfile) btnProfile.addEventListener('click', () => window.startProfile(2000));

window.onerror = function (msg, url, line, col, error) {
  const err = `Error: ${msg} at ${line}:${col}`;
  console.error(err);
  if (elProfileResults) elProfileResults.innerText = err;
  window.lastError = err;
};

class SpiralGrid {
  constructor() {
    this.chunks = new Map();
    this.minX = 0; this.maxX = 0;
    this.minY = 0; this.maxY = 0;
  }

  clear() {
    this.chunks.clear();
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

  queryPoint(x, y) {
    const kx = Math.floor(x / CHUNK_SIZE);
    const ky = Math.floor(y / CHUNK_SIZE);
    const key = (ky << 16) | (kx & 0xFFFF);
    return this.chunks.get(key);
  }
}

const grid = new SpiralGrid();

function initPrimesProgressive() {
  currentJobId++;
  const jobId = currentJobId;

  primeMap.fill(1);
  primeMap[0] = 0;
  primeMap[1] = 0;

  if (elProfileResults) elProfileResults.innerText = "Calculating Primes...";

  let i = 2;
  const BATCH_TIME = 15;

  function processSieve() {
    if (currentJobId !== jobId) return;

    const start = performance.now();
    while (i * i <= maxNumber) {
      if (primeMap[i]) {
        for (let j = i * i; j <= maxNumber; j += i) primeMap[j] = 0;
      }
      i++;
      if (performance.now() - start > BATCH_TIME) {
        requestAnimationFrame(processSieve);
        return;
      }
    }

    if (elProfileResults) elProfileResults.innerText = "Primes Ready.";
    updateCache();
  }
  processSieve();
}

function warpR(r, R0) { return (r * r) / (r + R0); }

let currentJobId = 0;

function updateCache() {
  const R0 = +sliderR0.value;
  const useWarp = checkWarp.checked;
  const PI2 = Math.PI * 2;

  currentJobId++;
  const jobId = currentJobId;

  const loadingThreshold = 500000;
  if (maxNumber > loadingThreshold) {
    if (elProfileResults) elProfileResults.innerText = "Calculating...";
  }

  let i = 0;
  const BATCH_TIME_MS = 12;

  function processChunk() {
    if (currentJobId !== jobId) return;

    const start = performance.now();
    while (i <= maxNumber) {
      const root = Math.sqrt(i);
      const r = root * SPACING;
      const theta = root * PI2;
      const rw = useWarp ? warpR(r, R0) : r;
      cacheX[i] = -Math.cos(theta) * rw;
      cacheY[i] = Math.sin(theta) * rw;
      i++;

      if (i % 1000 === 0 && (performance.now() - start) > BATCH_TIME_MS) {
        requestAnimationFrame(processChunk);
        return;
      }
    }

    grid.build();
    invalidateSpriteCache();
    updateWarpGraph();
    if (elProfileResults) elProfileResults.innerText = "Ready.";
    requestAnimationFrame(() => draw(performance.now()));
  }

  processChunk();
}

function updateWarpGraph() {
  const w = warpGraph.width;
  const h = warpGraph.height;
  const R0 = +sliderR0.value;
  ctxGraph.clearRect(0, 0, w, h);

  if (!checkWarp.checked) {
    ctxGraph.strokeStyle = "#4db8ff";
    ctxGraph.lineWidth = 2;
    ctxGraph.beginPath();
    ctxGraph.moveTo(0, h);
    ctxGraph.lineTo(w, 0);
    ctxGraph.stroke();
    return;
  }

  const maxR = 500;
  ctxGraph.strokeStyle = "#ff3333";
  ctxGraph.lineWidth = 2;
  ctxGraph.beginPath();
  for (let px = 0; px < w; px++) {
    const t = px / w;
    const r = t * maxR;
    const rw = warpR(r, R0);
    const plotY = 1.0 - (rw / maxR);
    ctxGraph.lineTo(px, plotY * h);
  }
  ctxGraph.stroke();
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  width = window.innerWidth;
  height = window.innerHeight;

  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  canvasOverlay.style.width = width + 'px';
  canvasOverlay.style.height = height + 'px';

  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  canvasOverlay.width = Math.floor(width * dpr);
  canvasOverlay.height = Math.floor(height * dpr);

  ctx.scale(dpr, dpr);
  ctxOverlay.scale(dpr, dpr);

  if (dbgDpr) dbgDpr.innerText = dpr.toFixed(2);
  if (dbgRes) dbgRes.innerText = `${canvas.width}x${canvas.height}`;

  centerX = width / 2;
  centerY = height / 2;
  window.centerX = centerX;
  window.centerY = centerY;

  requestAnimationFrame(draw);
  requestAnimationFrame(drawOverlay);
}

function checkHover() {
  const kx = Math.floor(mouseWorldX / CHUNK_SIZE);
  const ky = Math.floor(mouseWorldY / CHUNK_SIZE);
  let bestDist2 = Infinity;
  let bestN = -1;
  const hitThreshold = (10 / scale);
  const hitThreshold2 = hitThreshold * hitThreshold;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = ((ky + dy) << 16) | ((kx + dx) & 0xFFFF);
      const c = grid.chunks.get(key);
      if (!c) continue;
      for (let k = 0; k < c.length; k++) {
        const i = c[k];
        const d2 = (cacheX[i] - mouseWorldX) ** 2 + (cacheY[i] - mouseWorldY) ** 2;
        if (d2 < hitThreshold2 && d2 < bestDist2) {
          bestDist2 = d2;
          bestN = i;
        }
      }
    }
  }

  if (bestN !== hoveredNumber) {
    hoveredNumber = bestN;
    if (hoveredNumber !== -1) {
      updateTooltipContent(hoveredNumber, primeMap[hoveredNumber] === 1);
    } else {
      if (infoPanel) infoPanel.innerHTML = "Hover over the spiral...";
    }
  }
}

function renderPixelMode(visibleChunks) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width;
  const h = canvas.height;
  const imageData = ctx.createImageData(w, h);
  const buf32 = new Uint32Array(imageData.data.buffer);

  // Use a slightly lighter background for PIXEL mode to maintain visibility
  buf32.fill(0xFF0D0D0D);

  const isSq = checkSq.checked;
  const isP2 = checkPow2 ? checkPow2.checked : false;
  const isP10 = checkPow10 ? checkPow10.checked : false;

  const tx = offsetX + centerX;
  const ty = offsetY + centerY;

  const COL_PRIME = 0xFF3333FF;
  const COL_SQUARE = 0xFFFFB84D;
  const COL_POW2 = 0xFFFF009D; // Purple ABGR
  const COL_POW10 = 0xFF00FF00; // Green ABGR
  const COL_COMP = 0xFF222222;

  let count = 0;

  const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;
  const isPowerOfTen = (n) => n === 10 || n === 100 || n === 1000 || n === 10000 || n === 100000 || n === 1000000;

  // Helper to draw a 3x3 splat for milestones
  function splat(idx, color) {
    buf32[idx] = color;
    // Bounds checking for neighbors
    if ((idx + 1) % w !== 0 && idx + 1 < buf32.length) buf32[idx + 1] = color;
    if (idx % w !== 0 && idx - 1 >= 0) buf32[idx - 1] = color;
    if (idx + w < buf32.length) buf32[idx + w] = color;
    if (idx - w >= 0) buf32[idx - w] = color;
  }

  // Use visibleChunks if provided for massive speedup
  if (visibleChunks) {
    for (const chunk of visibleChunks) {
      for (let k = 0; k < chunk.length; k++) {
        const i = chunk[k];
        const px = cacheX[i] * scale + tx;
        const py = cacheY[i] * scale + ty;

        if (px < 0 || px >= width || py < 0 || py >= height) continue;

        const ix = (px * dpr) | 0;
        const iy = (py * dpr) | 0;
        const idx = iy * w + ix;
        const current = buf32[idx];

        // Priority Logic: P10 > P2 > Prime > Square
        if (isP10 && isPowerOfTen(i)) {
          splat(idx, COL_POW10);
          count++;
          continue;
        }

        if (isP2 && isPowerOfTwo(i)) {
          if (current !== COL_POW10) {
            splat(idx, COL_POW2);
            count++;
          }
          continue;
        }

        const isMilestone = (current === COL_POW10 || current === COL_POW2);

        if (primeMap[i] === 1) {
          if (!isMilestone) {
            buf32[idx] = COL_PRIME;
            count++;
          }
        } else if (isSq && Number.isInteger(Math.sqrt(i))) {
          if (!isMilestone) {
            buf32[idx] = COL_SQUARE;
            count++;
          }
        }
      }
    }
  } else {
    // Fallback if no chunks (rarely used now)
    for (let i = 0; i <= maxNumber; i++) {
      const px = cacheX[i] * scale + tx;
      const py = cacheY[i] * scale + ty;
      if (px < 0 || px >= width || py < 0 || py >= height) continue;
      const ix = (px * dpr) | 0;
      const iy = (py * dpr) | 0;
      const idx = iy * w + ix;
      const current = buf32[idx];

      if (isP10 && isPowerOfTen(i)) {
        splat(idx, COL_POW10);
        count++;
        continue;
      }
      if (isP2 && isPowerOfTwo(i)) {
        if (current !== COL_POW10) { splat(idx, COL_POW2); count++; }
        continue;
      }

      const isMilestone = (current === COL_POW10 || current === COL_POW2);
      if (primeMap[i] === 1) {
        if (!isMilestone) { buf32[idx] = COL_PRIME; count++; }
      } else if (isSq && Number.isInteger(Math.sqrt(i))) {
        if (!isMilestone) { buf32[idx] = COL_SQUARE; count++; }
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return count;
}

function renderVectorMode(visibleChunks) {
  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(centerX + offsetX, centerY + offsetY);
  ctx.scale(scale, scale);

  const dotSize = 1.2 / scale;
  const isGrid = checkGrid.checked;
  const isSq = checkSq.checked;
  const isP2 = checkPow2 ? checkPow2.checked : false;
  const isP10 = checkPow10 ? checkPow10.checked : false;

  const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;
  const isPowerOfTen = (n) => n === 10 || n === 100 || n === 1000 || n === 10000 || n === 100000 || n === 1000000;

  if (checkDebug.checked) {
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "rgba(255, 0, 0, 0.3)";
    for (const chunk of visibleChunks) {
      if (chunk.length === 0) continue;
      const i0 = chunk[0];
      const kx = Math.floor(cacheX[i0] / CHUNK_SIZE);
      const ky = Math.floor(cacheY[i0] / CHUNK_SIZE);
      ctx.strokeRect(kx * CHUNK_SIZE, ky * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
      ctx.fillStyle = "rgba(255, 0, 0, 0.05)";
      ctx.fillRect(kx * CHUNK_SIZE, ky * CHUNK_SIZE, CHUNK_SIZE, CHUNK_SIZE);
    }
  }

  if (isGrid) {
    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath();
    for (const chunk of visibleChunks) {
      for (let k = 0; k < chunk.length; k++) {
        const i = chunk[k];
        if (i === 0) continue;
        ctx.moveTo(cacheX[i - 1], cacheY[i - 1]);
        ctx.lineTo(cacheX[i], cacheY[i]);
      }
    }
    ctx.stroke();
  }

  let count = 0;
  ctx.fillStyle = "#ff3333";
  ctx.beginPath();
  for (const chunk of visibleChunks) {
    for (let k = 0; k < chunk.length; k++) {
      const i = chunk[k];
      if (primeMap[i] === 1) {
        ctx.rect(cacheX[i] - dotSize / 2, cacheY[i] - dotSize / 2, dotSize, dotSize);
        count++;
      }
    }
  }
  ctx.fill();

  if (isSq) {
    ctx.fillStyle = "#4db8ff";
    ctx.beginPath();
    for (const chunk of visibleChunks) {
      for (let k = 0; k < chunk.length; k++) {
        const i = chunk[k];
        if (primeMap[i] === 0) {
          const root = Math.sqrt(i);
          if (Number.isInteger(root)) {
            const sz = dotSize * 1.5;
            ctx.rect(cacheX[i] - sz / 2, cacheY[i] - sz / 2, sz, sz);
            count++;
          }
        }
      }
    }
    ctx.fill();
  }

  if (isP2) {
    ctx.fillStyle = "#9d00ff";
    ctx.beginPath();
    for (const chunk of visibleChunks) {
      for (let k = 0; k < chunk.length; k++) {
        const i = chunk[k];
        if (isPowerOfTwo(i)) {
          const sz = dotSize * 2.5;
          ctx.rect(cacheX[i] - sz / 2, cacheY[i] - sz / 2, sz, sz);
          count++;
        }
      }
    }
    ctx.fill();
  }

  if (isP10) {
    ctx.fillStyle = "#00ff00";
    ctx.beginPath();
    for (const chunk of visibleChunks) {
      for (let k = 0; k < chunk.length; k++) {
        const i = chunk[k];
        if (isPowerOfTen(i)) {
          const sz = dotSize * 3.5;
          ctx.rect(cacheX[i] - sz / 2, cacheY[i] - sz / 2, sz, sz);
          count++;
        }
      }
    }
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.beginPath();
  for (const chunk of visibleChunks) {
    for (let k = 0; k < chunk.length; k++) {
      const i = chunk[k];
      if (primeMap[i] === 0) {
        const root = Math.sqrt(i);
        if (!isSq || !Number.isInteger(root)) {
          ctx.rect(cacheX[i] - dotSize / 2, cacheY[i] - dotSize / 2, dotSize, dotSize);
          count++;
        }
      }
    }
  }
  ctx.fill();

  if (hoveredNumber !== -1) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(cacheX[hoveredNumber], cacheY[hoveredNumber], dotSize * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
  return count;
}

function draw(timestamp) {
  const start = performance.now();
  if (timestamp) {
    frameCount++;
    if (timestamp - lastFpsUpdate >= 500) {
      const fps = Math.round((frameCount * 1000) / (timestamp - lastFpsUpdate));
      elFps.innerText = fps;
      lastFpsUpdate = timestamp;
      frameCount = 0;
    }
  }

  const tBounds = profiler.markStart('CalcBounds');
  const topLeftX = (-centerX - offsetX) / scale;
  const topLeftY = (-centerY - offsetY) / scale;
  const bottomRightX = (width - centerX - offsetX) / scale;
  const bottomRightY = (height - centerY - offsetY) / scale;
  profiler.markEnd('CalcBounds', tBounds);

  const tQuery = profiler.markStart('GridQuery');
  const queryResult = grid.query(topLeftX, topLeftY, bottomRightX, bottomRightY);
  const potentialVisible = queryResult.count;
  const chunks = queryResult.chunks;
  profiler.markEnd('GridQuery', tQuery);

  let strategy = 'VECTOR';
  if (scale < 0.2 || potentialVisible > SAFETY_LIMIT) {
    strategy = 'PIXEL';
  }

  let count = 0;
  if (strategy === 'PIXEL') {
    const tRender = profiler.markStart('RenderPixel');
    count = renderPixelMode(chunks);
    profiler.markEnd('RenderPixel', tRender);
    elStrategy.innerText = "PIXEL (High Density)";
    elStrategy.style.color = "#4db8ff";
  } else {
    const tRender = profiler.markStart('RenderVector');
    count = renderVectorMode(chunks);
    profiler.markEnd('RenderVector', tRender);
    elStrategy.innerText = "VECTOR (Detail)";
    elStrategy.style.color = "#ff3333";
  }

  elVisible.innerText = count.toLocaleString();
  elRenderTime.innerText = `${(performance.now() - start).toFixed(1)}ms`;

  // --- Smooth Camera Interpolation ---
  const lerp = (a, b, f) => a + (b - a) * f;
  scale = lerp(scale, targetScale, 0.2);
  offsetX = lerp(offsetX, targetOffsetX, 0.2);
  offsetY = lerp(offsetY, targetOffsetY, 0.2);

  if (Math.abs(scale - targetScale) > 0.0001 ||
    Math.abs(offsetX - targetOffsetX) > 0.1 ||
    Math.abs(offsetY - targetOffsetY) > 0.1) {
    requestAnimationFrame(draw);
  }

  // Update HUD
  if (dbgZoom) dbgZoom.innerText = scale.toFixed(4);
  if (dbgVisibleCount) dbgVisibleCount.innerText = count.toLocaleString();
  if (dbgStrategyVal) dbgStrategyVal.innerText = strategy;
  if (dbgOffset) dbgOffset.innerText = `${offsetX.toFixed(0)}, ${offsetY.toFixed(0)}`;
  if (dbgMin) dbgMin.innerText = `${topLeftX.toFixed(1)}, ${topLeftY.toFixed(1)}`;
  if (dbgMax) dbgMax.innerText = `${bottomRightX.toFixed(1)}, ${bottomRightY.toFixed(1)}`;

  window.zoom = scale;
  window.offsetX = offsetX;
  window.offsetY = offsetY;

  if (profiler.active) {
    profiler.logFrame(performance.now() - start);
    profiler.logBatch(performance.now() - start);
  }
}

function updateTooltipContent(n, isPrime) {
  let html = `<strong>Number: ${n.toLocaleString()}</strong><br>`;
  if (isPrime) {
    html += `<span class="tag prime" style="color:#ff3333">PRIME NUMBER</span>`;
  } else {
    html += `<span class="tag comp" style="color:#888">Composite</span>`;
    const root = Math.sqrt(n);
    if (Number.isInteger(root)) {
      html += `<br><span style="color:#4db8ff">Perfect Square (${root}²)</span>`;
    }
    const isPowerOfTwo = (n) => n > 0 && (n & (n - 1)) === 0;
    const isPowerOfTen = (n) => n === 10 || n === 100 || n === 1000 || n === 10000 || n === 100000 || n === 1000000;

    if (isPowerOfTwo(n)) {
      html += `<br><span style="color:#9d00ff; font-weight:bold;">Power of 2 (${Math.log2(n).toFixed(0)})</span>`;
    }
    if (isPowerOfTen(n)) {
      html += `<br><span style="color:#00ff00; font-weight:bold;">Power of 10 ($10^{Math.log10(n).toFixed(0)}$)</span>`;
    }
  }
  if (infoPanel) infoPanel.innerHTML = html;
}

function drawOverlay() {
  ctxOverlay.clearRect(0, 0, width, height);
  if (hoveredNumber !== -1) {
    const tx = offsetX + centerX;
    const ty = offsetY + centerY;
    const hx = cacheX[hoveredNumber] * scale + tx;
    const hy = cacheY[hoveredNumber] * scale + ty;
    ctxOverlay.strokeStyle = "#fff";
    ctxOverlay.lineWidth = 2;
    ctxOverlay.beginPath();
    ctxOverlay.arc(hx, hy, 4, 0, Math.PI * 2);
    ctxOverlay.stroke();
  }

  if (mouseWorldX !== 0 && mouseWorldY !== 0) {
    const cx = mouseWorldX * scale + centerX + offsetX;
    const cy = mouseWorldY * scale + centerY + offsetY;
    ctxOverlay.strokeStyle = "#0f0";
    ctxOverlay.lineWidth = 1;
    ctxOverlay.beginPath();
    ctxOverlay.moveTo(cx - 10, cy);
    ctxOverlay.lineTo(cx + 10, cy);
    ctxOverlay.moveTo(cx, cy - 10);
    ctxOverlay.lineTo(cx, cy + 10);
    ctxOverlay.stroke();
    if (dbgMouse) dbgMouse.innerText = `${mouseWorldX.toFixed(0)}, ${mouseWorldY.toFixed(0)}`;
  }
}

canvasOverlay.addEventListener('wheel', (e) => {
  e.preventDefault();
  const zoomIntensity = 0.15; // Increased for better feel
  const direction = e.deltaY < 0 ? 1 : -1;
  const factor = Math.exp(direction * zoomIntensity);

  const mouseX = (e.clientX - centerX - targetOffsetX) / targetScale;
  const mouseY = (e.clientY - centerY - targetOffsetY) / targetScale;

  targetScale *= factor;
  targetScale = Math.max(0.005, Math.min(500, targetScale));

  targetOffsetX -= mouseX * (targetScale - targetScale / factor);
  targetOffsetY -= mouseY * (targetScale - targetScale / factor);

  requestAnimationFrame(draw);
  requestAnimationFrame(drawOverlay);
}, { passive: false });

canvasOverlay.addEventListener('mousedown', (e) => {
  isDragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvasOverlay.style.cursor = 'grabbing';
});
window.addEventListener('mouseup', () => { isDragging = false; canvasOverlay.style.cursor = 'crosshair'; });
window.addEventListener('mousemove', (e) => {
  mouseWorldX = (e.clientX - centerX - offsetX) / scale;
  mouseWorldY = (e.clientY - centerY - offsetY) / scale;
  window.mouseWorldX = mouseWorldX;
  window.mouseWorldY = mouseWorldY;
  window.scale = scale;
  if (isDragging) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    targetOffsetX += dx;
    targetOffsetY += dy;
    lastX = e.clientX;
    lastY = e.clientY;
    requestAnimationFrame(draw);
  } else {
    checkHover();
    requestAnimationFrame(drawOverlay);
  }
});

checkGrid.addEventListener('change', () => requestAnimationFrame(draw));
checkDebug.addEventListener('change', () => requestAnimationFrame(draw));
checkSq.addEventListener('change', () => requestAnimationFrame(draw));
if (checkPow2) checkPow2.addEventListener('change', () => requestAnimationFrame(draw));
if (checkPow10) checkPow10.addEventListener('change', () => requestAnimationFrame(draw));
checkWarp.addEventListener('change', () => updateCache());

let sliderTimeout = null;
sliderR0.addEventListener('input', () => {
  elR0.innerText = sliderR0.value;
  if (sliderTimeout) clearTimeout(sliderTimeout);
  sliderTimeout = setTimeout(() => updateCache(), 100);
});

function init() {
  if (elMax) elMax.value = maxNumber;
  elR0.innerText = sliderR0.value;
  requestAnimationFrame(() => {
    initPrimesProgressive();
    resize();
    window.addEventListener('resize', resize);
    const loading = document.getElementById('loading');
    if (loading) { loading.style.opacity = 0; setTimeout(() => loading.remove(), 500); }
  });
}

window.updateMaxNumber = (newMax) => {
  allocateBuffers(newMax);
  grid.clear();
  if (elMax) elMax.value = newMax;
  initPrimesProgressive();
};

window.zoomBy = (factor) => { scale *= factor; requestAnimationFrame(draw); requestAnimationFrame(drawOverlay); };
window.panBy = (dx, dy) => { offsetX += dx; offsetY += dy; requestAnimationFrame(draw); requestAnimationFrame(drawOverlay); };

document.getElementById('btn-zoom-in').addEventListener('click', () => window.zoomBy(1.2));
document.getElementById('btn-zoom-out').addEventListener('click', () => window.zoomBy(0.8));
document.getElementById('btn-up').addEventListener('click', () => window.panBy(0, 50));
document.getElementById('btn-down').addEventListener('click', () => window.panBy(0, -50));
document.getElementById('btn-left').addEventListener('click', () => window.panBy(50, 0));
document.getElementById('btn-right').addEventListener('click', () => window.panBy(-50, 0));

init();
