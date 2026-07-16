// ============================================================
// ASHENMOOR — sound engine + visual FX helpers.
// Real audio samples (assets/sfx/*.mp3, generated via ElevenLabs —
// see tools/gen-sfx.mjs) played through WebAudio with per-sound
// volume and a little random pitch so repeats never sound identical.
// The original synth remains as automatic fallback for any file
// that is missing or fails to decode, so the game always has sound.
// ============================================================
let ctx = null;
let muted = false;

// ---------- sample library ----------
// vol = gain, jitter = random playbackRate spread (organic repeats)
const SFX_DEFS = {
  click:    { vol: 0.40, jitter: 0.05 },
  deny:     { vol: 0.50, jitter: 0.03 },
  draw:     { vol: 0.45, jitter: 0.08 },
  play:     { vol: 0.55, jitter: 0.06 },
  attack:   { vol: 0.70, jitter: 0.08 },
  thwart:   { vol: 0.55, jitter: 0.05 },
  dmg:      { vol: 0.70, jitter: 0.08 },
  heal:     { vol: 0.50, jitter: 0.04 },
  shield:   { vol: 0.55, jitter: 0.05 },
  block:    { vol: 0.60, jitter: 0.07 },
  threat:   { vol: 0.60, jitter: 0.04 },
  threatDn: { vol: 0.50, jitter: 0.04 },
  reveal:   { vol: 0.60, jitter: 0.04 },
  spawn:    { vol: 0.60, jitter: 0.06 },
  incoming: { vol: 0.55, jitter: 0.04 },
  kill:     { vol: 0.65, jitter: 0.06 },
  stage:    { vol: 0.75, jitter: 0.02 },
  win:      { vol: 0.70, jitter: 0 },
  lose:     { vol: 0.70, jitter: 0 },
  turn:     { vol: 0.45, jitter: 0.03 },
  whoosh:   { vol: 0.50, jitter: 0.10 },
  nova:     { vol: 0.75, jitter: 0.04 },
  heartbeat:{ vol: 0.70, jitter: 0.03 },
  shatter:  { vol: 0.70, jitter: 0.04 },
  rally:    { vol: 0.55, jitter: 0.04 },
};
// ambience loops per villain stage (0..2)
const AMB_DEFS = { amb_calm: 0.34, amb_tense: 0.38, amb_doom: 0.42 };
const AMB_BY_STAGE = ["amb_calm", "amb_tense", "amb_doom"];

const RAW = {};      // name -> ArrayBuffer (fetched at module load)
const BUFS = {};     // name -> AudioBuffer (decoded once ctx exists)
let decodePromise = null;

const ALL_FILES = [...Object.keys(SFX_DEFS), ...Object.keys(AMB_DEFS)];
const fetchPromise = Promise.allSettled(ALL_FILES.map(async (n) => {
  const r = await fetch(`assets/sfx/${n}.mp3`);
  if (!r.ok) throw new Error("404");
  RAW[n] = await r.arrayBuffer();
}));

// mp3 encoders pad both ends with silence; trim so ambience loops don't dip
function trimSilence(c, buf, thresh = 0.004) {
  const d0 = buf.getChannelData(0);
  let s = 0, e = d0.length - 1;
  while (s < e && Math.abs(d0[s]) < thresh) s++;
  while (e > s && Math.abs(d0[e]) < thresh) e--;
  if (e - s < c.sampleRate * 0.5) return buf;
  const out = c.createBuffer(buf.numberOfChannels, e - s + 1, buf.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    out.copyToChannel(buf.getChannelData(ch).subarray(s, e + 1), ch);
  }
  return out;
}

function decodeAll(c) {
  if (!decodePromise) {
    decodePromise = fetchPromise.then(() => Promise.allSettled(
      Object.keys(RAW).map(async (n) => {
        try {
          const b = await c.decodeAudioData(RAW[n].slice(0));
          BUFS[n] = n.startsWith("amb_") ? trimSilence(c, b) : b;
        } finally {
          delete RAW[n];
        }
      })
    )).then(() => { decodedAll = true; onAudioReady(); });
  }
  return decodePromise;
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    decodeAll(ctx);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

let sfxBus = null;
function bus(c) {
  if (!sfxBus) {
    sfxBus = c.createGain();
    sfxBus.gain.value = muted ? 0 : 0.9 * volSfx;
    sfxBus.connect(c.destination);
  }
  return sfxBus;
}

let volMusic = 1, volSfx = 1;
function applyGains() {
  if (sfxBus) sfxBus.gain.value = muted ? 0 : 0.9 * volSfx;
  if (music) music.out.gain.value = muted ? 0 : volMusic;
  if (drone) drone.gain.gain.value = muted ? 0 : DRONE_VOL * volMusic;
}
export function setMuted(m) { muted = m; applyGains(); }
export function isMuted() { return muted; }
export function setVolumes(m, s) {
  volMusic = Math.max(0, Math.min(1, m));
  volSfx = Math.max(0, Math.min(1, s));
  applyGains();
}

// play a sample; false = not available, caller should synth-fallback
function playBuf(name) {
  if (muted) return true;
  const c = ac();
  if (!c) return false;
  const b = BUFS[name];
  if (!b) return false;
  const def = SFX_DEFS[name] || {};
  const src = c.createBufferSource();
  src.buffer = b;
  const j = def.jitter || 0;
  if (j) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * j;
  const g = c.createGain();
  g.gain.value = def.vol ?? 0.5;
  src.connect(g).connect(bus(c));
  src.start();
  return true;
}

// ---------- synth fallback primitives ----------
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

const FALLBACK = {
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

export const sfx = {};
for (const name of Object.keys(SFX_DEFS)) {
  sfx[name] = () => { if (!playBuf(name)) FALLBACK[name]?.(); };
}

// ---------- ambience / music ----------
// With samples: one looping ambience bed per villain stage, crossfaded.
// Without samples: the original synth drone + generative score.
let music = null;       // { out, amb: {name, src, g} | null, legacy: timer | null }
let musicStage = 0;
let droneWanted = false;
let drone = null;       // legacy synth drone (fallback only)
const DRONE_VOL = 0.018;
const AMB_FADE = 2.5;

function ambReady() { return !!BUFS[AMB_BY_STAGE[0]]; }
let decodedAll = false;

function onAudioReady() {
  if (music) syncAmbience();
  if (droneWanted && !ambReady()) realStartDrone();
}

function syncAmbience() {
  if (!music || !ctx) return;
  const want = AMB_BY_STAGE[musicStage];
  if (BUFS[want]) {
    if (music.amb && music.amb.name === want) return;
    const c = ctx;
    if (music.amb) {
      const old = music.amb;
      old.g.gain.linearRampToValueAtTime(0.0001, c.currentTime + AMB_FADE);
      setTimeout(() => { try { old.src.stop(); } catch {} }, AMB_FADE * 1000 + 200);
    }
    const src = c.createBufferSource();
    src.buffer = BUFS[want];
    src.loop = true;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, c.currentTime);
    g.gain.linearRampToValueAtTime(AMB_DEFS[want] ?? 0.35, c.currentTime + AMB_FADE);
    src.connect(g).connect(music.out);
    src.start();
    music.amb = { name: want, src, g };
  } else if (decodedAll && !music.legacy) {
    startLegacyScore();
  }
}

export function setMusicStage(n) {
  musicStage = Math.max(0, Math.min(2, n | 0));
  syncAmbience();
}

export function startMusic() {
  const c = ac();
  if (!c || music) return;
  const out = c.createGain();
  out.gain.value = muted ? 0 : volMusic;
  out.connect(c.destination);
  music = { out, amb: null, legacy: null };
  syncAmbience();
}

export function stopMusic() {
  if (!music) return;
  const m = music;
  music = null;
  try { m.out.gain.linearRampToValueAtTime(0.0001, ac().currentTime + 0.9); } catch {}
  setTimeout(() => {
    if (m.legacy) clearInterval(m.legacy);
    try { m.amb?.src.stop(); } catch {}
    try { m.out.disconnect(); } catch {}
  }, 1000);
}

// legacy generative score: sparse bass walk + echoing bells (fallback only)
const BASS = [55, 49, 43.65, 51.9];               // A1 G1 F1 G#1
const BELLS = [220, 261.63, 293.66, 329.63, 392]; // A minor pentatonic-ish
function startLegacyScore() {
  const c = ctx;
  if (!c || !music || music.legacy) return;
  const out = music.out;
  const delay = c.createDelay(1.2);
  delay.delayTime.value = 0.42;
  const fb = c.createGain(); fb.gain.value = 0.38;
  const wet = c.createGain(); wet.gain.value = 0.5;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(out);
  let bar = 0;
  music.legacy = setInterval(() => {
    if (muted || !music) return;
    const t0 = c.currentTime + 0.05;
    const beat = 60 / (72 + musicStage * 8);
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
    if (musicStage >= 1) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = "sine"; o.frequency.value = bassF * 1.5;
      g.gain.setValueAtTime(0.022, t0 + beat);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + beat * 2.4);
      o.connect(g).connect(out); o.start(t0 + beat); o.stop(t0 + beat * 2.5);
    }
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
}

// drone: with samples the ambience bed covers it, so this only arms the
// legacy synth drone for the no-samples case
export function startDrone() {
  droneWanted = true;
  const c = ac();
  if (!c) return;
  if (decodedAll && !ambReady()) realStartDrone();
}
function realStartDrone() {
  const c = ctx;
  if (!c || drone || !droneWanted) return;
  const g = c.createGain();
  g.gain.value = muted ? 0 : DRONE_VOL * volMusic;
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
  droneWanted = false;
  if (!drone) return;
  const d = drone; drone = null;
  try { d.gain.gain.linearRampToValueAtTime(0.0001, ac().currentTime + 0.8); } catch {}
  setTimeout(() => d.stop(), 900);
}

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

export function banner(text, tone = "", hold = 1500) {
  const host = document.getElementById("overlays");
  if (!host) return;
  host.querySelectorAll(".banner.vp").forEach((b) => b.remove()); // one step-banner at a time
  const el = document.createElement("div");
  el.className = "banner " + tone;
  el.innerHTML = `<div class="banner-inner">${text}</div>`;
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), hold);
  setTimeout(() => el.remove(), hold + 600);
}
