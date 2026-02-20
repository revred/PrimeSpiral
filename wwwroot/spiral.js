/**
 * PRIME SPIRAL v2.0 | Flagship UX
 * Optimized for Sharc Engine @ 20M points
 */

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const canvasOverlay = document.getElementById('canvas-overlay');
const ctxOverlay = canvasOverlay.getContext('2d');

// --- DATA STATE ---
let maxNumber = 373587883;
let minNumber = 0;
let primeMap = null;
let cacheX = null;
let cacheY = null;
const SPACING = 1;

// --- GLOBAL SETTINGS ---
const SAFETY_LIMIT = 50000;
let hoveredPrime = null;
let hoveredNeighbors = [];

// --- COMPONENTS ---
const camera = new Camera(window.innerWidth / 2, window.innerHeight / 2);
window.camera = camera;

// --- UI BINDINGS ---
const elPrimes = document.getElementById('disp-primes');
const elFps = document.getElementById('disp-fps');
const elTooltip = document.getElementById('tooltip');
const elTooltipN = document.getElementById('tooltip-n');
const elTooltipSeq = document.getElementById('tooltip-seq');

// --- VERTICAL RANGE SLIDER ---
const sliderTrack = document.querySelector('.slider-track');
const sliderMaxHandle = document.getElementById('slider-max-handle');
const sliderMinHandle = document.getElementById('slider-min-handle');

let isDraggingMax = false;
let isDraggingMin = false;

function updateSliderUI() {
  const trackRect = sliderTrack.getBoundingClientRect();
  const maxPerc = (1 - (maxNumber / 373587883)) * 100;
  const minPerc = (1 - (minNumber / 373587883)) * 100;

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

sliderMaxHandle.onmousedown = () => isDraggingMax = true;
sliderMinHandle.onmousedown = () => isDraggingMin = true;
window.onmouseup = () => { isDraggingMax = false; isDraggingMin = false; };
window.onmousemove = handleSliderMove;

// Touch support
sliderMaxHandle.ontouchstart = (e) => { isDraggingMax = true; e.preventDefault(); };
sliderMinHandle.ontouchstart = (e) => { isDraggingMin = true; e.preventDefault(); };
window.ontouchend = () => { isDraggingMax = false; isDraggingMin = false; };
window.ontouchmove = handleSliderMove;

// --- GRID ENGINE (JS Fallback) ---
class SpiralGrid {
  constructor() {
    this.cellSize = 200;
    this.primeChunks = new Map();
  }
  key(x, y) { return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`; }
  build() {
    this.primeChunks.clear();
    if (!cacheX) return;
    for (let i = minNumber; i <= maxNumber; i++) {
      if (primeMap && primeMap[i] === 1) {
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
  allocateBuffers(maxNumber);
  await initPrimes();
  updateCache();
  updateSliderUI();
  requestAnimationFrame(draw);
}

function allocateBuffers(max) {
  maxNumber = max;
  primeMap = new Uint8Array(maxNumber + 1);
  cacheX = new Float32Array(maxNumber + 1);
  cacheY = new Float32Array(maxNumber + 1);
}

async function initPrimes() {
  if (window.wasmEngine && window.wasmEngine.isReady) {
    const wasmMap = await window.wasmEngine.getPrimeMap(maxNumber);
    if (wasmMap) primeMap = wasmMap;
  }
  if (!primeMap) {
    // Simple Sieve Fallback
    primeMap.fill(1); primeMap[0] = primeMap[1] = 0;
    for (let i = 2; i * i <= maxNumber; i++) {
      if (primeMap[i]) for (let j = i * i; j <= maxNumber; j += i) primeMap[j] = 0;
    }
  }
  updateCache();
}

function updateCache() {
  const PI2 = Math.PI * 2;
  for (let i = 0; i <= maxNumber; i++) {
    const root = Math.sqrt(i);
    const theta = root * PI2;
    cacheX[i] = -Math.cos(theta) * root;
    cacheY[i] = Math.sin(theta) * root;
  }
  grid.build();
  if (window.wasmEngine && window.wasmEngine.isReady) {
    window.wasmEngine.setTransform(SPACING, 0, false).then(() => window.wasmEngine.buildGrid(maxNumber));
  }
}

window.updateMaxNumber = (val) => {
  if (val > 20000000) val = 20000000;
  if (val === maxNumber) return;
  allocateBuffers(val);
  initPrimes();
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

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);

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
  if (elPrimes) elPrimes.innerText = count.toLocaleString();
  if (elFps) elFps.innerText = Math.round(1000 / (performance.now() - start + 1)) + " FPS";

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
    elTooltip.style.display = 'none';
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

const inputHandler = new InputHandler(canvasOverlay, camera, () => {
  const wx = window.mouseWorldX;
  const wy = window.mouseWorldY;

  const searchRad = 50 / camera.renderScale;
  if (window.wasmEngine && window.wasmEngine.isReady) {
    window.wasmEngine.getNeighborhoodIds(wx, wy, searchRad, 5).then(ids => {
      if (ids && ids.length > 0) {
        hoveredPrime = ids[0];
        hoveredNeighbors = []; // Hydrate if needed
        requestAnimationFrame(draw);
      } else {
        hoveredPrime = null;
        requestAnimationFrame(draw);
      }
    });
  }
});

// Start
resize();
init();
