// ============================================================
// ASHENMOOR — sound (WebAudio synth, no asset files) + visual FX helpers
// ============================================================
let ctx = null;
let muted = false;
let drone = null;
const DRONE_VOL = 0.018;

export function setMuted(m) {
  muted = m;
  if (drone) drone.gain.gain.value = muted ? 0 : DRONE_VOL;
  if (music) music.out.gain.value = muted ? 0 : 1;
}
export function isMuted() { return muted; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

function tone(f, dur, type = "sine", vol = 0.12, delay = 0, endF = 0) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(Math.max(20, f), t0);
  if (endF) o.frequency.exponentialRampToValueAtTime(Math.max(20, endF), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur, vol = 0.15, delay = 0, freq = 900, q = 1) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

// low, slow ambient dread — two detuned oscillators through a dark filter
export function startDrone() {
  const c = ac();
  if (!c || drone) return;
  const g = c.createGain();
  g.gain.value = muted ? 0 : DRONE_VOL;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = 220;
  const o1 = c.createOscillator(); o1.type = "sawtooth"; o1.frequency.value = 55;
  const o2 = c.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = 55.7;
  const lfo = c.createOscillator(); lfo.frequency.value = 0.07;
  const lfoG = c.createGain(); lfoG.gain.value = 90;
  lfo.connect(lfoG).connect(f.frequency);
  o1.connect(f); o2.connect(f);
  f.connect(g).connect(c.destination);
  o1.start(); o2.start(); lfo.start();
  drone = { gain: g, stop: () => { try { o1.stop(); o2.stop(); lfo.stop(); g.disconnect(); } catch {} } };
}
export function stopDrone() {
  if (!drone) return;
  const d = drone; drone = null;
  try { d.gain.gain.linearRampToValueAtTime(0.0001, ac().currentTime + 0.8); } catch {}
  setTimeout(() => d.stop(), 900);
}

// ---------- generative score: sparse bass walk + echoing bells ----------
// Intensity follows the villain stage (0..2): faster pulse, added fifth.
let music = null;
let musicStage = 0;
const BASS = [55, 49, 43.65, 51.9];              // A1 G1 F1 G#1
const BELLS = [220, 261.63, 293.66, 329.63, 392]; // A minor pentatonic-ish

export function setMusicStage(n) { musicStage = Math.max(0, Math.min(2, n | 0)); }

export function startMusic() {
  const c = ac();
  if (!c || music) return;
  const out = c.createGain();
  out.gain.value = muted ? 0 : 1;
  // echo bus for bells
  const delay = c.createDelay(1.2);
  delay.delayTime.value = 0.42;
  const fb = c.createGain(); fb.gain.value = 0.38;
  const wet = c.createGain(); wet.gain.value = 0.5;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  out.connect(c.destination);
  let bar = 0;
  const timer = setInterval(() => {
    if (muted || !music) return;
    const t0 = c.currentTime + 0.05;
    const beat = 60 / (72 + musicStage * 8);
    // bass note on beat 1 (and beat 3 when enraged)
    const bassF = BASS[bar % BASS.length];
    const playBass = (at) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "triangle"; o.frequency.value = bassF;
      g.gain.setValueAtTime(0.05, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + beat * 1.8);
      o.connect(g).connect(out); o.start(at); o.stop(at + beat * 2);
    };
    playBass(t0);
    if (musicStage >= 2) playBass(t0 + beat * 2);
    // pulsing low fifth from stage 1
    if (musicStage >= 1) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = bassF * 1.5;
      g.gain.setValueAtTime(0.022, t0 + beat);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + beat * 2.4);
      o.connect(g).connect(out); o.start(t0 + beat); o.stop(t0 + beat * 2.5);
    }
    // sparse bell (55% of bars), echoed
    if (Math.random() < 0.55) {
      const f = BELLS[(Math.random() * BELLS.length) | 0] * (Math.random() < 0.2 ? 2 : 1);
      const at = t0 + beat * (1 + ((Math.random() * 2) | 0));
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.035, at);
      g.gain.exponentialRampToValueAtTime(0.001, at + 1.1);
      o.connect(g); g.connect(out); g.connect(delay);
      o.start(at); o.stop(at + 1.2);
    }
    bar++;
  }, (60 / 72) * 4 * 1000 * 0.98);
  music = { out, timer, stop: () => { clearInterval(timer); try { out.disconnect(); } catch {} } };
}
export function stopMusic() {
  if (!music) return;
  const m = music; music = null;
  try { m.out.gain.linearRampToValueAtTime(0.0001, ac().currentTime + 0.9); } catch {}
  setTimeout(() => m.stop(), 1000);
}

export const sfx = {
  click:    () => tone(640, 0.05, "square", 0.04),
  deny:     () => { tone(200, 0.1, "square", 0.06); tone(150, 0.12, "square", 0.06, 0.08); },
  draw:     () => { noise(0.08, 0.05, 0, 2200, 2); tone(540, 0.06, "triangle", 0.05, 0.02); },
  play:     () => { noise(0.12, 0.07, 0, 1400, 1.5); tone(420, 0.1, "triangle", 0.07); },
  attack:   () => { tone(140, 0.16, "sawtooth", 0.16, 0, 55); noise(0.1, 0.12, 0.02, 500, 1); },
  thwart:   () => { tone(760, 0.12, "sine", 0.09, 0, 990); tone(990, 0.14, "sine", 0.06, 0.08); },
  dmg:      () => { noise(0.14, 0.2, 0, 300, 0.8); tone(90, 0.18, "sawtooth", 0.14, 0, 45); },
  heal:     () => { tone(520, 0.12, "sine", 0.08); tone(660, 0.12, "sine", 0.08, 0.09); tone(780, 0.16, "sine", 0.08, 0.18); },
  shield:   () => { tone(300, 0.16, "triangle", 0.1, 0, 340); },
  block:    () => { tone(220, 0.1, "square", 0.1); noise(0.08, 0.1, 0, 900, 2); },
  threat:   () => { tone(96, 0.3, "sine", 0.14, 0, 62); },
  threatDn: () => { tone(320, 0.14, "sine", 0.08, 0, 470); },
  reveal:   () => { noise(0.2, 0.08, 0, 700, 1.2); tone(180, 0.22, "triangle", 0.08, 0.02, 120); },
  spawn:    () => { tone(130, 0.2, "sawtooth", 0.1, 0, 200); },
  incoming: () => { tone(240, 0.12, "square", 0.08); tone(240, 0.12, "square", 0.08, 0.16); },
  kill:     () => { noise(0.22, 0.14, 0, 400, 0.7); tone(70, 0.26, "sawtooth", 0.1, 0.02, 40); },
  stage:    () => { tone(110, 0.5, "sawtooth", 0.14, 0, 55); tone(165, 0.5, "sawtooth", 0.1, 0.1, 82); noise(0.4, 0.1, 0, 250, 0.6); },
  win:      () => { [392, 494, 587, 784].forEach((f, i) => tone(f, 0.35, "triangle", 0.12, i * 0.14)); },
  lose:     () => { [330, 262, 208, 165].forEach((f, i) => tone(f, 0.4, "sawtooth", 0.1, i * 0.18, f * 0.94)); },
  turn:     () => { tone(520, 0.1, "triangle", 0.07); tone(780, 0.14, "triangle", 0.06, 0.09); },
  whoosh:   () => { noise(0.22, 0.09, 0, 900, 0.7); tone(300, 0.18, "sine", 0.05, 0, 520); },
  nova:     () => { noise(0.3, 0.16, 0, 500, 0.6); tone(120, 0.35, "sawtooth", 0.12, 0, 60); tone(180, 0.3, "sawtooth", 0.08, 0.06, 90); },
  heartbeat:() => { tone(52, 0.13, "sine", 0.26); tone(48, 0.16, "sine", 0.22, 0.24); },
  shatter:  () => { noise(0.5, 0.22, 0, 350, 0.5); tone(90, 0.5, "sawtooth", 0.16, 0, 38); noise(0.35, 0.12, 0.08, 1600, 1.4); },
  rally:    () => { [330, 415, 494].forEach((f, i) => tone(f, 0.2, "triangle", 0.09, i * 0.07)); },
};

// ---------- visual helpers ----------
export function floatText(anchor, text, cls = "") {
  const host = document.getElementById("floats");
  if (!host) return;
  const r = anchor ? anchor.getBoundingClientRect() : { left: innerWidth / 2 - 20, top: innerHeight / 2, width: 40, height: 0 };
  const el = document.createElement("div");
  el.className = "float " + cls;
  el.textContent = text;
  el.style.left = r.left + r.width / 2 + (Math.random() * 24 - 12) + "px";
  el.style.top = r.top + r.height * 0.35 + "px";
  host.appendChild(el);
  setTimeout(() => el.remove(), 1300);
}

export function shake(el, hard = false) {
  if (!el) return;
  el.classList.remove("shake", "shake-hard");
  void el.offsetWidth; // restart animation
  el.classList.add(hard ? "shake-hard" : "shake");
  el.addEventListener("animationend", () => el.classList.remove("shake", "shake-hard"), { once: true });
}

export function banner(text, tone = "") {
  const host = document.getElementById("overlays");
  if (!host) return;
  const el = document.createElement("div");
  el.className = "banner " + tone;
  el.innerHTML = `<div class="banner-inner">${text}</div>`;
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), 1500);
  setTimeout(() => el.remove(), 2100);
}
