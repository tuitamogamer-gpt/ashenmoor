// Deterministic seeded RNG (mulberry32). The RNG state is a plain number kept
// in the game state, so a saved game replays identically after reload.
export function seedFrom(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function next(state) {
  // returns [float 0..1, newState]
  let a = (state + 0x6D2B79F5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const f = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [f, a];
}

export function randInt(S, max) {
  // 0..max-1, mutates S.rng
  const [f, ns] = next(S.rng);
  S.rng = ns;
  return Math.floor(f * max);
}

export function shuffle(S, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(S, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
