/**
 * PRIME SPIRAL v2.0 | Flagship UX
 * Optimized for Sharc Engine @ 20M points
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const canvasOverlay = document.getElementById('canvas-overlay');
const ctxOverlay = canvasOverlay.getContext('2d');

// --- DATA STATE ---
const MAX_N = 20000000;
let maxNumber = 2000000;
let minNumber = 0;
let primeMap = new Uint8Array(MAX_N + 1);
let cacheX = new Float32Array(MAX_N + 1);
let cacheY = new Float32Array(MAX_N + 1);
let sievedMax = 1;
let cachedMax = -1;
let cachedR0 = -1;
const SPACING = 1;

// --- GLOBAL SETTINGS ---
const SAFETY_LIMIT = 50000;
let hoveredPrime = null;
let hoveredNeighbors = [];
const HOVER_TOPK_K = 8;
const HOVER_TOPK_RADIUS_MULTIPLIER = 2.5;
let pendingTopKHoverQuery = null;
let isTopKHoverQueryRunning = false;
let topKHoverQueryVersion = 0;

// --- COMPONENTS ---
const camera = new Camera(window.innerWidth / 2, window.innerHeight / 2);
window.camera = camera;

// --- UI BINDINGS ---
const elVisible = document.getElementById('disp-visible');
const elFps = document.getElementById('disp-fps');
const elTooltip = document.getElementById('tooltip');
const elTooltipN = document.getElementById('tooltip-n');
const elTooltipSeq = document.getElementById('tooltip-seq');

// Diagnostics Panel
const dbgZoom = document.getElementById('dbg-zoom');
const dbgVisibleCount = document.getElementById('dbg-visible-count');
const dbgOffset = document.getElementById('dbg-offset');
const dbgMin = document.getElementById('dbg-min');
const dbgMax = document.getElementById('dbg-max');
const dbgRes = document.getElementById('dbg-res');

// --- VERTICAL RANGE SLIDER ---
const sliderTrack = document.querySelector('.slider-track');
const sliderMaxHandle = document.getElementById('slider-max-handle');
const sliderMinHandle = document.getElementById('slider-min-handle');

let isDraggingMax = false;
let isDraggingMin = false;

function updateSliderUI() {
  if (!sliderTrack || !sliderMaxHandle || !sliderMinHandle) return;
  const trackRect = sliderTrack.getBoundingClientRect();
  const maxPerc = (1 - (maxNumber / 20000000)) * 100;
  const minPerc = (1 - (minNumber / 20000000)) * 100;

  sliderMaxHandle.style.top = `${maxPerc}%`;
  sliderMinHandle.style.top = `${minPerc}%`;
}

function handleSliderMove(e) {
  if (!isDraggingMax && !isDraggingMin) return;

  const rect = sliderTrack.getBoundingClientRect();
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  let perc = (clientY - rect.top) / rect.height;
  perc = Math.max(0, Math.min(1, perc));

  const val = Math.floor((1 - perc) * 20000000);

  if (isDraggingMax) {
    maxNumber = Math.max(minNumber + 1000, val);
    updateMaxNumber(maxNumber);
  } else if (isDraggingMin) {
    minNumber = Math.min(maxNumber - 1000, val);
    requestAnimationFrame(draw);
  }
  updateSliderUI();
}

if (sliderMaxHandle) sliderMaxHandle.onmousedown = () => isDraggingMax = true;
if (sliderMinHandle) sliderMinHandle.onmousedown = () => isDraggingMin = true;
window.onmouseup = () => { isDraggingMax = false; isDraggingMin = false; };
window.onmousemove = handleSliderMove;

// Touch support
if (sliderMaxHandle) sliderMaxHandle.ontouchstart = (e) => { isDraggingMax = true; e.preventDefault(); };
if (sliderMinHandle) sliderMinHandle.ontouchstart = (e) => { isDraggingMin = true; e.preventDefault(); };
window.ontouchend = () => { isDraggingMax = false; isDraggingMin = false; };
window.ontouchmove = handleSliderMove;

// --- INPUT HANDLER (Restored from main) ---
class InputHandler {
  constructor(canvas, camera, onRedraw) {
    this.canvas = canvas;
    this.camera = camera;
    this.onRedraw = onRedraw;

    this.isDragging = false;
    this.lastX = 0;
    this.lastY = 0;

    this.worldX = 0;
    this.worldY = 0;
    this.bindEvents();
  }

  bindEvents() {
    const c = this.canvas;

    // Wheel (Zoom)
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomIntensity = 0.15;
      const direction = e.deltaY < 0 ? 1 : -1;
      const factor = Math.exp(direction * zoomIntensity);

      this.camera.zoomTo(e.clientX, e.clientY, factor);
      this.requestUpdate();
    }, { passive: false });

    // Drag (Pan)
    c.addEventListener('mousedown', (e) => {
      this.isDragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      c.style.cursor = 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
      c.style.cursor = 'crosshair';
    });

    window.addEventListener('mousemove', (e) => {
      const wp = this.camera.screenToWorld(e.clientX, e.clientY);
      this.worldX = wp.x;
      this.worldY = wp.y;

      if (this.isDragging) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.camera.panBy(dx, dy);
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.requestUpdate();
      } else {
        // Node hover raycast triggers automatically in drawOverlay via checking worldX/Y
        this.requestUpdate();
      }
    });
  }

  requestUpdate() {
    if (this.onRedraw) this.onRedraw();
  }
}

const inputController = new InputHandler(canvasOverlay, camera, () => requestAnimationFrame(draw));


// --- GRID ENGINE (JS Fallback) ---
class SpiralGrid {
  constructor() {
    this.cellSize = 200;
    this.primeChunks = new Map();
  }
  key(x, y) { return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; }
  build() {
    this.primeChunks.clear();
    for (let i = minNumber; i <= maxNumber; i++) {
      if (primeMap[i] === 1) {
        const k = this.key(cacheX[i], cacheY[i]);
        if (!this.primeChunks.has(k)) this.primeChunks.set(k, []);
        this.primeChunks.get(k).push(i);
      }
    }
  }
  queryPrimes(tl, br) {
    const chunks = [];
    let count = 0;
    for (let y = Math.floor(tl.y / this.cellSize); y <= Math.floor(br.y / this.cellSize); y++) {
      for (let x = Math.floor(tl.x / this.cellSize); x <= Math.floor(br.x / this.cellSize); x++) {
        const chunk = this.primeChunks.get(`${x},${y}`);
        if (chunk) { chunks.push(chunk); count += chunk.length; }
      }
    }
    return { chunks, count };
  }
}
const grid = new SpiralGrid();

// --- CORE LOGIC ---
async function init() {
  maxNumber = 2000000;
  await initPrimes();
  updateCache();
  updateSliderUI();

  // Hide the initialization overlay now that we're ready to render
  const loadingEl = document.getElementById('loading');
  if (loadingEl) loadingEl.style.display = 'none';

  requestAnimationFrame(draw);
}

function allocateBuffers(max) {
  // Pre-allocated globally. 
  maxNumber = max;
}

async function initPrimes() {
  if (sievedMax >= maxNumber) {
    updateCache();
    return;
  }

  if (sievedMax <= 1) {
    primeMap.fill(1);
    primeMap[0] = primeMap[1] = 0;
    sievedMax = 1;
  }

  // Sieve the remaining numbers incrementally
  const start = Math.max(2, sievedMax + 1);
  const root = Math.floor(Math.sqrt(maxNumber));

  // Outer loop to clear multiples
  for (let i = 2; i <= root; i++) {
    if (primeMap[i]) {
      // Find the first multiple of i that is >= start
      let startMultiple = Math.max(i * i, Math.ceil(start / i) * i);
      for (let j = startMultiple; j <= maxNumber; j += i) {
        primeMap[j] = 0;
      }
    }
  }
  sievedMax = maxNumber;
  updateCache();
}

function updateCache() {
  const PI2 = Math.PI * 2;
  const elWarp = document.getElementById('toggle-warp');
  const elR0 = document.getElementById('warp-r0');
  const isWarp = elWarp ? elWarp.checked : false;
  const r0 = isWarp && elR0 ? parseFloat(elR0.value) : 0;

  // Determine if we need a full rebuild (warp changing) or incremental
  const fullRebuild = (cachedR0 !== r0);
  const startIdx = fullRebuild ? 0 : Math.max(0, cachedMax + 1);

  if (startIdx <= maxNumber) {
    for (let i = startIdx; i <= maxNumber; i++) {
      let rootVal;
      if (r0 > 0) {
        rootVal = Math.sqrt(i + r0 * r0) - r0;
      } else {
        rootVal = Math.sqrt(i);
      }
      const theta = rootVal * PI2;
      cacheX[i] = -Math.cos(theta) * rootVal;
      cacheY[i] = Math.sin(theta) * rootVal;
    }
  }

  cachedMax = maxNumber;
  cachedR0 = r0;

  grid.build();
  if (window.wasmEngine && window.wasmEngine.isReady) {
    window.wasmEngine.setTransform(SPACING, r0, false).then(() => window.wasmEngine.buildGrid(maxNumber));
  }
}

window.updateMaxNumber = (val) => {
  if (val > 20000000) val = 20000000;
  if (val === maxNumber) return;

  maxNumber = val;

  // Yield to UI Thread before freezing
  setTimeout(() => {
    initPrimes().then(() => requestAnimationFrame(draw));
  }, 20);
};

// --- RENDER CLOUD ---
function draw() {
  const start = performance.now();
  camera.update();

  const dpr = window.devicePixelRatio || 1;
  const W = canvas.width / dpr;
  const H = canvas.height / dpr;

  const tl = camera.screenToWorld(0, 0);
  const br = camera.screenToWorld(W, H);

  const pQuery = grid.queryPrimes(tl, br);
  const count = pQuery.count;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const scale = camera.renderScale;
  const offX = camera.centerX + camera.renderOffset.x;
  const offY = camera.centerY + camera.renderOffset.y;

  if (scale < 0.2 || count > SAFETY_LIMIT) {
    // PIXEL MODE (LOD)
    const iW = canvas.width, iH = canvas.height;
    const imgData = ctx.createImageData(iW, iH);
    const buf32 = new Uint32Array(imgData.data.buffer);
    buf32.fill(0xFF000000); // ARGB black

    const stride = scale < 0.05 ? 4 : (scale < 0.1 ? 2 : 1);
    const FINAL_COLOR = scale < 0.05 ? 0xFF333333 : 0xFF5555FF; // BGR Blueish-Red

    for (const chunk of pQuery.chunks) {
      for (let j = 0; j < chunk.length; j += stride) {
        const i = chunk[j];
        const sx = ((cacheX[i] * scale + offX) * dpr) | 0;
        const sy = ((cacheY[i] * scale + offY) * dpr) | 0;
        if (sx >= 0 && sx < iW && sy >= 0 && sy < iH) {
          buf32[sy * iW + sx] = FINAL_COLOR;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
  } else {
    // VECTOR MODE
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.translate(offX, offY);
    ctx.scale(scale, scale);
    ctx.fillStyle = "#FF3B30";
    const dotSize = 1.2 / scale;
    for (const chunk of pQuery.chunks) {
      for (let i of chunk) {
        ctx.fillRect(cacheX[i] - dotSize / 2, cacheY[i] - dotSize / 2, dotSize, dotSize);
      }
    }
    ctx.restore();
  }

  // UI Updates
  if (elVisible) elVisible.innerText = count.toLocaleString();
  if (dbgVisibleCount) dbgVisibleCount.innerText = count.toLocaleString();
  if (elFps) elFps.innerText = Math.round(1000 / (performance.now() - start + 1)) + " FPS";

  if (dbgRes) dbgRes.innerText = `${Math.round(W)}x${Math.round(H)}`;
  if (dbgZoom) dbgZoom.innerText = camera.renderScale.toFixed(4);
  if (dbgOffset) dbgOffset.innerText = `${Math.round(camera.renderOffset.x)}, ${Math.round(camera.renderOffset.y)}`;
  if (dbgMin) dbgMin.innerText = `${Math.round(tl.x)}, ${Math.round(tl.y)}`;
  if (dbgMax) dbgMax.innerText = `${Math.round(br.x)}, ${Math.round(br.y)}`;

  drawOverlay();
  if (camera.isMoving) requestAnimationFrame(draw);
}

function drawOverlay() {
  const dpr = window.devicePixelRatio || 1;
  ctxOverlay.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctxOverlay.clearRect(0, 0, canvasOverlay.width / dpr, canvasOverlay.height / dpr);

  if (hoveredPrime !== null) {
    renderPearl(hoveredPrime);
    showTooltip(hoveredPrime);
  } else {
    if (elTooltip) elTooltip.style.display = 'none';
  }
}

function renderPearl(id) {
  const scale = camera.renderScale;
  const offX = camera.centerX + camera.renderOffset.x;
  const offY = camera.centerY + camera.renderOffset.y;

  const x = cacheX[id] * scale + offX;
  const y = cacheY[id] * scale + offY;

  ctxOverlay.beginPath();
  ctxOverlay.arc(x, y, 6, 0, Math.PI * 2);
  ctxOverlay.fillStyle = "#fff";
  ctxOverlay.fill();
  ctxOverlay.strokeStyle = "#FF3B30";
  ctxOverlay.lineWidth = 2;
  ctxOverlay.stroke();

  // Connections
  if (hoveredNeighbors && hoveredNeighbors.length > 0) {
    ctxOverlay.beginPath();
    ctxOverlay.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctxOverlay.setLineDash([2, 4]);
    hoveredNeighbors.forEach(n => {
      const nx = n.x * scale + offX;
      const ny = n.y * scale + offY;
      ctxOverlay.moveTo(x, y);
      ctxOverlay.lineTo(nx, ny);
    });
    ctxOverlay.stroke();
    ctxOverlay.setLineDash([]);
  }
}

function showTooltip(id) {
  elTooltip.style.display = 'block';
  elTooltipN.innerText = id.toLocaleString();
  elTooltipSeq.innerText = `Prime #${Math.floor(id / Math.log(id)).toLocaleString()}`; // Est.

  // Position
  const rect = canvas.getBoundingClientRect();
  const x = (cacheX[id] * camera.renderScale + camera.centerX + camera.renderOffset.x);
  const y = (cacheY[id] * camera.renderScale + camera.centerY + camera.renderOffset.y);

  elTooltip.style.left = `${x + 20}px`;
  elTooltip.style.top = `${y - 40}px`;
}

// --- INPUT HOOKS ---
window.addEventListener('resize', resize);
function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  canvasOverlay.width = canvas.width;
  canvasOverlay.height = canvas.height;
  canvasOverlay.style.width = canvas.style.width;
  canvasOverlay.style.height = canvas.style.height;
  camera.resize(window.innerWidth, window.innerHeight);
  requestAnimationFrame(draw);
}

function getNearestPrimeLocal(worldX, worldY, maxRadius) {
  let bestDistSq = maxRadius * maxRadius;
  let bestId = null;

  // Optimize: Only search chunks near the mouse
  const cx = Math.floor(worldX / grid.cellSize);
  const cy = Math.floor(worldY / grid.cellSize);

  for (let oy = -1; oy <= 1; oy++) {
    for (let ox = -1; ox <= 1; ox++) {
      const chunk = grid.primeChunks.get(`${cx + ox},${cy + oy}`);
      if (chunk) {
        for (let i of chunk) {
          const dx = cacheX[i] - worldX;
          const dy = cacheY[i] - worldY;
          const dSq = dx * dx + dy * dy;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestId = i;
          }
        }
      }
    }
  }
  return bestId;
}

function isRenderablePrimeId(id) {
  return Number.isInteger(id) &&
    id >= minNumber &&
    id <= maxNumber &&
    id < primeMap.length &&
    primeMap[id] === 1;
}

function buildNeighborPointsFromIds(ids, centerId) {
  const neighbors = [];
  for (const id of ids) {
    if (id === centerId || !isRenderablePrimeId(id)) continue;
    neighbors.push({ id, x: cacheX[id], y: cacheY[id] });
    if (neighbors.length >= HOVER_TOPK_K - 1) break;
  }
  return neighbors;
}

function scheduleTopKHoverQuery(wx, wy, searchRad) {
  if (!window.wasmEngine || !window.wasmEngine.sharcReady) return;
  if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(searchRad) || searchRad <= 0) return;

  pendingTopKHoverQuery = {
    wx,
    wy,
    maxDist: searchRad * HOVER_TOPK_RADIUS_MULTIPLIER,
    version: ++topKHoverQueryVersion
  };

  if (!isTopKHoverQueryRunning) {
    void runTopKHoverQueryQueue();
  }
}

async function runTopKHoverQueryQueue() {
  isTopKHoverQueryRunning = true;
  try {
    while (pendingTopKHoverQuery) {
      const query = pendingTopKHoverQuery;
      pendingTopKHoverQuery = null;

      try {
        const ids = await window.wasmEngine.sharcGetKNeighborsTopK(query.wx, query.wy, HOVER_TOPK_K, query.maxDist);
        if (query.version !== topKHoverQueryVersion) continue; // stale result
        if (!Array.isArray(ids) || ids.length === 0) continue;

        let nearestId = null;
        for (const id of ids) {
          if (isRenderablePrimeId(id)) {
            nearestId = id;
            break;
          }
        }
        if (nearestId === null) continue;

        hoveredPrime = nearestId;
        hoveredNeighbors = buildNeighborPointsFromIds(ids, nearestId);
        requestAnimationFrame(draw);
      } catch {
        // Keep local hover path active if TopK query transiently fails.
      }
    }
  } finally {
    isTopKHoverQueryRunning = false;
  }
}

const inputHandler = new InputHandler(canvasOverlay, camera, () => {
  const wx = window.mouseWorldX || (inputHandler ? inputHandler.worldX : 0);
  const wy = window.mouseWorldY || (inputHandler ? inputHandler.worldY : 0);

  const searchRad = 20 / Math.max(camera.renderScale, 0.0001); // 20 pixels max hover distance
  const nearestId = getNearestPrimeLocal(wx, wy, searchRad);
  scheduleTopKHoverQuery(wx, wy, searchRad);

  if (nearestId !== null) {
    const changed = hoveredPrime !== nearestId;
    hoveredPrime = nearestId;
    if (changed) hoveredNeighbors = [];
    requestAnimationFrame(draw);
  } else {
    if (hoveredPrime !== null) {
      hoveredPrime = null;
      hoveredNeighbors = [];
      requestAnimationFrame(draw);
    }
  }
});

function initUI() {
  const bindClick = (id, fn) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (e) => { e.preventDefault(); fn(e); });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); fn(e); }, { passive: false });
  };

  const updateMin = (val) => {
    minNumber = Math.max(0, Math.min(maxNumber - 100, val));
    const el = document.getElementById('inp-min');
    if (el) el.value = minNumber;
    updateSliderUI();
    requestAnimationFrame(draw);
  };

  bindClick('btn-dec-min-1k', () => updateMin(minNumber - 1000));
  bindClick('btn-dec-min-100', () => updateMin(minNumber - 100));
  bindClick('btn-inc-min-100', () => updateMin(minNumber + 100));
  bindClick('btn-inc-min-1k', () => updateMin(minNumber + 1000));

  const elInpMin = document.getElementById('inp-min');
  if (elInpMin) {
    elInpMin.addEventListener('change', (e) => updateMin(parseInt(e.target.value.replace(/,/g, '')) || 0));
  }

  const updateMax = (val) => {
    const nextMax = Math.max(minNumber + 100, Math.min(20000000, val));
    const el = document.getElementById('inp-max');
    if (el) el.value = nextMax > 999999 ? (nextMax / 1000000).toFixed(1) + 'M' : nextMax;
    updateMaxNumber(nextMax);
  };

  bindClick('btn-dec-100k', () => updateMax(maxNumber - 100000));
  bindClick('btn-dec-10k', () => updateMax(maxNumber - 10000));
  bindClick('btn-inc-10k', () => updateMax(maxNumber + 10000));
  bindClick('btn-inc-100k', () => updateMax(maxNumber + 100000));

  const elInpMax = document.getElementById('inp-max');
  if (elInpMax) {
    elInpMax.addEventListener('change', (e) => {
      let valStr = e.target.value.replace(/,/g, '').toUpperCase();
      let val = parseFloat(valStr);
      if (valStr.includes('M')) val *= 1000000;
      else if (valStr.includes('K')) val *= 1000;
      updateMax(val || 2000000);
    });
  }

  const elWarpToggle = document.getElementById('toggle-warp');
  const elWarpR0 = document.getElementById('warp-r0');
  const elDispR0 = document.getElementById('disp-r0');

  if (elWarpToggle) {
    elWarpToggle.addEventListener('change', () => { updateCache(); requestAnimationFrame(draw); });
  }
  if (elWarpR0) {
    elWarpR0.addEventListener('input', (e) => {
      if (elDispR0) elDispR0.innerText = e.target.value;
      updateCache();
      requestAnimationFrame(draw);
    });
  }
}

// Start
resize();
initUI();
init();
