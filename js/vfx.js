// ============================================================
// ASHENMOOR — VFX engine: canvas particles, beams, shockwaves,
// ambient embers, rains, and the targeting line.
// Additive-blend glow. Honors prefers-reduced-motion.
// ============================================================
const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
const DPR_CAP = 1.5;
const MAX_PARTS = 700;

const PAL = {
  ember:  ["#ffb46a", "#ff8a3d", "#ff5d2e", "#ffd9a0"],
  void:   ["#a184ff", "#7a5cff", "#d0c2ff", "#5d3fd6"],
  teal:   ["#3fc9b6", "#7fe8d9", "#b8fff1"],
  heal:   ["#5fc76a", "#a8e8ad", "#d6ffd9"],
  shield: ["#58a6ff", "#bcdcff", "#8ec5ff"],
  ash:    ["#8d93a3", "#5a6070", "#454b59"],
  white:  ["#fff8e8", "#ffe9c2"],
};
const pick = (a) => a[(Math.random() * a.length) | 0];

let cv = null, cx = null, W = 0, H = 0, dpr = 1;
let parts = [], waves = [], beams = [], rains = [];
let ambient = false, lineSel = null, mouse = { x: 0, y: 0 };
let running = false, last = 0;

function resize() {
  if (!cv) return;
  dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  cv.style.width = W + "px"; cv.style.height = H + "px";
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function init() {
  if (cv) return;
  cv = document.createElement("canvas");
  cv.id = "vfx";
  cv.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:280;";
  document.body.appendChild(cv);
  cx = cv.getContext("2d");
  addEventListener("resize", resize);
  addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
  addEventListener("blur", () => { running = false; });
  addEventListener("focus", () => { last = performance.now(); kick(); });
  resize();
}

function kick() {
  if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); }
}

let intensity = 1;
export function setIntensity(x) { intensity = x; }

export function setAmbient(on) {
  ambient = on && !REDUCED;
  if (ambient) kick();
}

function spawn(p) {
  if (parts.length >= MAX_PARTS) parts.splice(0, 20);
  parts.push({
    g: 0, drag: 1, size: 2, glow: true, sway: 0, swayT: Math.random() * 6,
    flicker: false, t: 0, ...p,
  });
}

// ---------- public emitters ----------
export function burst(kind, x, y, n = 14, spread = 1) {
  if (REDUCED) n = Math.min(4, n);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (20 + Math.random() * 130) * spread;
    if (kind === "spark") spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, g: 140, drag: 0.92, life: 0.45 + Math.random() * 0.5, size: 1 + Math.random() * 2.4, color: pick(PAL.ember), flicker: true });
    else if (kind === "soul") spawn({ x, y, vx: Math.cos(a) * sp * 0.4, vy: -20 - Math.random() * 60, g: -30, drag: 0.96, life: 0.9 + Math.random() * 0.7, size: 1.5 + Math.random() * 3, color: pick(PAL.void) });
    else if (kind === "void") spawn({ x, y, vx: Math.cos(a) * sp * 0.5, vy: Math.sin(a) * sp * 0.5, g: -20, drag: 0.9, life: 0.6 + Math.random() * 0.5, size: 1.5 + Math.random() * 2.5, color: pick(PAL.void) });
    else if (kind === "heal") spawn({ x: x + (Math.random() - 0.5) * 50, y: y + 20, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 50, life: 0.8 + Math.random() * 0.5, size: 1.5 + Math.random() * 2, color: pick(PAL.heal) });
    else if (kind === "shield") spawn({ x: x + Math.cos(a) * 34, y: y + Math.sin(a) * 44, vx: Math.cos(a) * 16, vy: Math.sin(a) * 16, life: 0.6 + Math.random() * 0.3, size: 1.4 + Math.random() * 1.8, color: pick(PAL.shield) });
    else if (kind === "teal") spawn({ x, y, vx: Math.cos(a) * sp * 0.6, vy: Math.sin(a) * sp * 0.6 - 20, g: 40, drag: 0.92, life: 0.5 + Math.random() * 0.4, size: 1.2 + Math.random() * 2, color: pick(PAL.teal), flicker: true });
    else if (kind === "white") spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 0.88, life: 0.3 + Math.random() * 0.3, size: 1 + Math.random() * 2, color: pick(PAL.white) });
  }
  kick();
}

export function burstAt(el, kind, n, spread) {
  const r = el?.getBoundingClientRect?.();
  if (!r) return;
  burst(kind, r.left + r.width / 2, r.top + r.height / 2, n, spread);
}

export function wave(x, y, color = "#ff8a3d", max = 130) {
  if (REDUCED) return;
  waves.push({ x, y, r: 6, max, color, a: 0.85 });
  kick();
}
export function waveAt(el, color, max) {
  const r = el?.getBoundingClientRect?.();
  if (!r) return;
  wave(r.left + r.width / 2, r.top + r.height / 2, color, max);
}

const TONE = { ember: PAL.ember, void: PAL.void, teal: PAL.teal, shield: PAL.shield, white: PAL.white, heal: PAL.heal };

export function beamEl(fromEl, toEl, tone = "ember", delay = 0) {
  const a = fromEl?.getBoundingClientRect?.(), b = toEl?.getBoundingClientRect?.();
  if (!a || !b) return;
  const bm = {
    x1: a.left + a.width / 2, y1: a.top + a.height / 2,
    x2: b.left + b.width / 2, y2: b.top + b.height / 2,
    t: -delay, dur: REDUCED ? 0.01 : 0.28, tone,
  };
  beams.push(bm);
  kick();
}

export function rain(kind, ms) {
  if (REDUCED) return;
  rains.push({ kind, until: performance.now() + ms });
  kick();
}

export function setTargetLine(sel) {
  lineSel = sel;
  if (sel) kick();
}

// explode an element's <img> into particles sampled from its own pixels
export function shatterEl(el) {
  const r = el?.getBoundingClientRect?.();
  if (!r) return;
  const img = el.querySelector?.("img");
  const fallback = () => { burst("soul", r.left + r.width / 2, r.top + r.height / 2, 44, 1.8); wave(r.left + r.width / 2, r.top + r.height / 2, "#a184ff", 220); };
  if (REDUCED || !img || !img.naturalWidth) { fallback(); return; }
  const COLS = 18, ROWS = 24;
  let data;
  try {
    const oc = document.createElement("canvas");
    oc.width = COLS; oc.height = ROWS;
    const octx = oc.getContext("2d");
    octx.drawImage(img, 0, 0, COLS, ROWS);
    data = octx.getImageData(0, 0, COLS, ROWS).data;
  } catch { fallback(); return; }
  const ir = img.getBoundingClientRect();
  const cx0 = ir.left + ir.width / 2, cy0 = ir.top + ir.height / 2;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const i = (y * COLS + x) * 4;
      if (data[i + 3] < 40) continue;
      const px = ir.left + ((x + 0.5) / COLS) * ir.width;
      const py = ir.top + ((y + 0.5) / ROWS) * ir.height;
      const dx = px - cx0, dy = py - cy0;
      const d = Math.hypot(dx, dy) || 1;
      const sp = 70 + Math.random() * 230;
      spawn({
        x: px, y: py,
        vx: (dx / d) * sp + (Math.random() - 0.5) * 70,
        vy: (dy / d) * sp - 70 + (Math.random() - 0.5) * 70,
        g: 300, drag: 0.965,
        life: 0.9 + Math.random() * 1,
        size: 2 + Math.random() * 2.8,
        color: `rgb(${data[i]},${data[i + 1]},${data[i + 2]})`,
        glow: false,
      });
    }
  }
  wave(cx0, cy0, "#a184ff", 240);
  wave(cx0, cy0, "#ff8a3d", 160);
  kick();
}

// ---------- loop ----------
function loop(now) {
  if (!running) { cx && cx.clearRect(0, 0, W, H); return; }
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
  last = now;

  // ambient embers
  if (ambient && parts.length < MAX_PARTS - 60 && Math.random() < (W > 900 ? 0.5 : 0.25) * intensity) {
    spawn({
      x: Math.random() * W, y: H + 8,
      vx: (Math.random() - 0.5) * 12, vy: -14 - Math.random() * 26,
      life: 5 + Math.random() * 5, size: 0.8 + Math.random() * 1.9,
      color: pick(PAL.ember), sway: 14 + Math.random() * 22, flicker: true, dim: true,
    });
  }
  // rains
  const nowMs = performance.now();
  rains = rains.filter((r) => r.until > nowMs);
  for (const r of rains) {
    for (let i = 0; i < 3; i++) {
      if (r.kind === "ember") {
        spawn({ x: Math.random() * W, y: H + 8, vx: (Math.random() - 0.5) * 30, vy: -80 - Math.random() * 160, g: 30, life: 2 + Math.random() * 2, size: 1 + Math.random() * 2.6, color: pick(PAL.ember), sway: 20, flicker: true });
        if (Math.random() < 0.4) spawn({ x: Math.random() * W, y: -8, vx: (Math.random() - 0.5) * 20, vy: 60 + Math.random() * 80, life: 2.5, size: 1 + Math.random() * 1.6, color: pick(PAL.white), sway: 26 });
      } else {
        spawn({ x: Math.random() * W, y: -8, vx: (Math.random() - 0.5) * 14, vy: 26 + Math.random() * 40, life: 4 + Math.random() * 3, size: 1.2 + Math.random() * 2.4, color: pick(PAL.ash), sway: 30 + Math.random() * 20, glow: false });
      }
    }
  }

  cx.clearRect(0, 0, W, H);

  // waves
  cx.save();
  cx.globalCompositeOperation = "lighter";
  waves = waves.filter((w) => w.a > 0.02);
  for (const w of waves) {
    w.r += (w.max - w.r) * dt * 7;
    w.a *= Math.pow(0.02, dt);
    cx.beginPath();
    cx.arc(w.x, w.y, w.r, 0, Math.PI * 2);
    cx.strokeStyle = w.color;
    cx.globalAlpha = w.a;
    cx.lineWidth = 2.5;
    cx.stroke();
  }

  // beams
  beams = beams.filter((b) => b.t < b.dur + 0.05);
  for (const b of beams) {
    b.t += dt;
    if (b.t < 0) continue;
    const k = Math.min(1, b.t / b.dur);
    const e = 1 - Math.pow(1 - k, 3); // easeOutCubic
    const hx = b.x1 + (b.x2 - b.x1) * e, hy = b.y1 + (b.y2 - b.y1) * e;
    const pal = TONE[b.tone] || PAL.ember;
    // trail
    cx.globalAlpha = 0.55 * (1 - k * 0.6);
    cx.strokeStyle = pal[0];
    cx.lineWidth = 3;
    cx.beginPath();
    const tx = b.x1 + (b.x2 - b.x1) * Math.max(0, e - 0.25), ty = b.y1 + (b.y2 - b.y1) * Math.max(0, e - 0.25);
    cx.moveTo(tx, ty);
    cx.lineTo(hx, hy);
    cx.stroke();
    // head
    cx.globalAlpha = 0.95;
    const gr = cx.createRadialGradient(hx, hy, 0, hx, hy, 12);
    gr.addColorStop(0, pal[2] || pal[0]);
    gr.addColorStop(1, "transparent");
    cx.fillStyle = gr;
    cx.beginPath(); cx.arc(hx, hy, 12, 0, Math.PI * 2); cx.fill();
    if (Math.random() < 0.8) spawn({ x: hx, y: hy, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.3, size: 1 + Math.random() * 1.6, color: pick(pal) });
    if (k >= 1 && !b.done) {
      b.done = true;
      burst(b.tone === "void" ? "void" : b.tone === "teal" ? "teal" : "spark", b.x2, b.y2, 16, 0.9);
      wave(b.x2, b.y2, pal[0], 70);
    }
  }

  // particles
  parts = parts.filter((p) => p.t < p.life);
  for (const p of parts) {
    p.t += dt;
    p.vy += (p.g || 0) * dt;
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.swayT += dt;
    const sx = p.sway ? Math.sin(p.swayT * 2.1) * p.sway * dt : 0;
    p.x += p.vx * dt + sx;
    p.y += p.vy * dt;
    const lifeK = 1 - p.t / p.life;
    let a = lifeK * (p.dim ? 0.5 : 1);
    if (p.flicker) a *= 0.7 + 0.3 * Math.sin(p.swayT * 12);
    if (!p.glow) cx.globalCompositeOperation = "source-over";
    cx.globalAlpha = Math.max(0, a);
    cx.fillStyle = p.color;
    cx.beginPath();
    cx.arc(p.x, p.y, p.size * (0.5 + lifeK * 0.5), 0, Math.PI * 2);
    cx.fill();
    if (!p.glow) cx.globalCompositeOperation = "lighter";
  }

  // targeting line
  if (lineSel) {
    const el = document.querySelector(lineSel);
    if (el) {
      const r = el.getBoundingClientRect();
      const x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
      const cxp = (x1 + mouse.x) / 2, cyp = Math.min(y1, mouse.y) - 90;
      cx.globalAlpha = 0.9;
      cx.strokeStyle = "#ff5d5d";
      cx.lineWidth = 2.5;
      cx.setLineDash([10, 8]);
      cx.lineDashOffset = -(now / 30) % 18;
      cx.beginPath();
      cx.moveTo(x1, y1);
      cx.quadraticCurveTo(cxp, cyp, mouse.x, mouse.y);
      cx.stroke();
      cx.setLineDash([]);
      // pulsing ring at cursor
      const pr = 12 + Math.sin(now / 140) * 4;
      cx.beginPath(); cx.arc(mouse.x, mouse.y, pr, 0, Math.PI * 2); cx.stroke();
      if (Math.random() < 0.5) spawn({ x: mouse.x, y: mouse.y, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.35, size: 1.2, color: "#ff8a8a" });
    }
  }
  cx.restore();

  if (!parts.length && !waves.length && !beams.length && !rains.length && !lineSel && !ambient) {
    running = false;
    cx.clearRect(0, 0, W, H);
  }
}
