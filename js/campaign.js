// ============================================================
// ASHENMOOR — The Long Vigil: campaign state, drafts, scars.
// Pure data layer over localStorage; UI screens live in ui.js.
// ============================================================
import { HEROES } from "./cards.js";

const KEY = "ashenmoor_campaign_v1";
export const ACTS = ["morvane", "vexahl", "nul"];
const MIN_MAXHP = 6;
const MIN_DECK = 20;

export const RELICS = ["cinder_of_the_first_flame", "wardens_oath", "shard_of_the_spire"];
export const HERO_EXTRAS = {
  kaelen: ["cleaving_arc", "battle_fury", "emberbrand", "stagger", "wardens_beacon"],
  sera: ["banish", "focus_crystal", "temporal_slip", "hex_of_cinders", "wardens_beacon"],
  odran: ["rally_the_watch", "vigil_banner", "stone_sentry", "judgment_bell", "wardens_beacon"],
};

export function load() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    return c && c.v === 1 && c.active ? c : null;
  } catch { return null; }
}
export function save(c) {
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch {}
}
export function clear() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function start(heroId, difficulty) {
  const c = {
    v: 1, active: true,
    heroId, difficulty,
    act: 0,
    deck: [...HEROES[heroId].deck],
    scars: 0,
    extraDoom: 0,
    history: [],
  };
  save(c);
  return c;
}

export const heroMaxHp = (c) => HEROES[c.heroId].hp - c.scars;
export const isDoomed = (c) => heroMaxHp(c) < MIN_MAXHP;
export const isComplete = (c) => c.act >= ACTS.length;
export const canRemove = (c) => c.deck.length > MIN_DECK;

// three distinct draft choices: hero extras + relics not yet drafted twice
export function draftOptions(c) {
  const owned = {};
  for (const id of c.deck) owned[id] = (owned[id] || 0) + 1;
  const pool = [...HERO_EXTRAS[c.heroId], ...RELICS].filter((id) => (owned[id] || 0) < 4);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}

export function addCard(c, id) {
  c.deck.push(id);
  save(c);
}
export function removeCard(c, id) {
  if (!canRemove(c)) return false;
  const i = c.deck.indexOf(id);
  if (i < 0) return false;
  c.deck.splice(i, 1);
  save(c);
  return true;
}

// consequences: barely surviving scars you; letting the scheme advance haunts the next act
export function applyWin(c, S) {
  c.history.push({ act: c.act, villain: ACTS[c.act], result: "win", rounds: S.stats.rounds, dmg: S.stats.dmgDealt });
  if (S.hero.hp <= 3) c.scars++;
  c.extraDoom = S.scheme.stage >= 1 ? 2 : 0;
  c.act++;
  save(c);
  return c;
}

export function applyLoss(c, S) {
  c.history.push({ act: c.act, villain: ACTS[c.act], result: "loss", rounds: S ? S.stats.rounds : 0, dmg: S ? S.stats.dmgDealt : 0 });
  c.scars++;
  save(c);
  return c;
}

export function finish(c) {
  c.active = false;
  save(c);
}
