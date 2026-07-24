// ============================================================
// ASHENMOOR — The Long Vigil: campaign state, drafts, scars.
// Pure data layer over localStorage; UI screens live in ui.js.
// ============================================================
import { HEROES, CARDS } from "./cards.js";

const KEY = "ashenmoor_campaign_v1";
export const ACTS = ["morvane", "vexahl", "nul"];
const MIN_MAXHP = 6;
const MIN_DECK = 20;

export const RELICS = ["cinder_of_the_first_flame", "wardens_oath", "shard_of_the_spire"];
export const HERO_EXTRAS = {
  kaelen: ["cleaving_arc", "battle_fury", "emberbrand", "stagger", "wardens_beacon", "pyre_burst", "ember_veteran"],
  sera: ["banish", "focus_crystal", "temporal_slip", "hex_of_cinders", "wardens_beacon", "mirror_ward", "void_siphon"],
  odran: ["rally_the_watch", "vigil_banner", "stone_sentry", "judgment_bell", "wardens_beacon", "oath_of_iron", "gravekeeper"],
  ilva: ["briar_bear", "pack_tactics", "thorn_ward", "beast_bond", "wardens_beacon", "stampede", "wild_mending"],
};

// ---- Complications: each act after the first carries lasting handicaps.
// They are rolled when you advance, stored on the run, and shown before you commit.
export const COMPLICATIONS = [
  { id: "warded",     name: "The Warded Court",  text: "The villain begins the act with an Obsidian Ward attached — the first damage he takes each round is reduced by 2.", attach: "obsidian_ward" },
  { id: "headstart",  name: "A Head Start",      text: "The agenda begins with 2 extra doom already on it.", doom: 2 },
  { id: "hunted",     name: "Hunted",            text: "A Rift Stalker is already prowling when the act begins.", minion: "rift_stalker" },
  { id: "impatient",  name: "The Impatient Dark", text: "Every stage of the agenda completes on 1 less doom.", mods: { threshold: -1 } },
  { id: "entrenched", name: "Entrenched",        text: "Every stage of the villain has +1 health.", mods: { villainHp: 1 } },
  { id: "thinned",    name: "Thinned Ranks",     text: "You refill your hand to one card fewer.", mods: { handSize: -1 } },
];

// ---- Crossroads: between acts you choose a boon, and every boon costs something.
export const CROSSROADS = [
  { id: "press",     name: "Press on through the night",
    boon: "Begin the next act with +1 Resolve (shield and an extra card).",
    cost: "The city burns behind you: +1 doom on the next agenda.",
    apply: (c) => { c.resolve = Math.min(3, (c.resolve || 0) + 1); c.extraDoom = (c.extraDoom || 0) + 1; } },
  { id: "tend",      name: "Tend your wounds",
    boon: "A scar closes — regain 1 max health.",
    cost: "The delay lets the dark dig in: one extra complication next act.",
    needsScar: true,
    apply: (c) => { c.scars = Math.max(0, c.scars - 1); c.extraComplication = (c.extraComplication || 0) + 1; } },
  { id: "reliquary", name: "Raid the reliquary",
    boon: "Draft two cards instead of one.",
    cost: "You wake something in the vault: +2 doom on the next agenda.",
    apply: (c) => { c.bonusDraft = (c.bonusDraft || 0) + 1; c.extraDoom = (c.extraDoom || 0) + 2; } },
  { id: "longroad",  name: "Walk the long road",
    boon: "Cut two cards from your deck instead of one.",
    cost: "The road costs you time: +1 doom on the next agenda.",
    apply: (c) => { c.bonusTrim = (c.bonusTrim || 0) + 1; c.extraDoom = (c.extraDoom || 0) + 1; } },
];

const shuffled = (arr, random) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// how many handicaps the act at index `act` carries
export const complicationCount = (c) => Math.max(0, c.act + (c.extraComplication || 0));

export function rollComplications(c, random = Math.random) {
  const n = Math.min(COMPLICATIONS.length, complicationCount(c));
  c.complications = shuffled(COMPLICATIONS, random).slice(0, n).map((k) => k.id);
  return c.complications;
}

export const activeComplications = (c) =>
  (c.complications || []).map((id) => COMPLICATIONS.find((k) => k.id === id)).filter(Boolean);

// two genuine choices; the healing one only appears when there is a scar to heal
export function crossroadsOptions(c, random = Math.random) {
  const pool = CROSSROADS.filter((x) => !x.needsScar || c.scars > 0);
  return shuffled(pool, random).slice(0, 2);
}

export function applyCrossroads(c, id, random = Math.random) {
  const pick = CROSSROADS.find((x) => x.id === id);
  if (!pick) return c;
  pick.apply(c);
  c.pending = "draft";
  rollComplications(c, random); // an added complication must show up immediately
  save(c);
  return c;
}

// everything the engine needs to start this act, complications folded in
export function actOpts(c) {
  const mods = { villainHp: 0, doomPerRound: 0, handSize: 0, threshold: 0 };
  let startDoom = c.extraDoom || 0;
  let startAttachment = null, startMinion = null;
  for (const k of activeComplications(c)) {
    if (k.mods) for (const [key, v] of Object.entries(k.mods)) mods[key] = (mods[key] || 0) + v;
    if (k.doom) startDoom += k.doom;
    if (k.attach) startAttachment = k.attach;
    if (k.minion) startMinion = k.minion;
  }
  return {
    deck: c.deck, maxHpMod: -c.scars, startDoom,
    startShield: c.resolve || 0, openingHandBonus: c.resolve || 0,
    isCampaign: true, mods, startAttachment, startMinion,
    complications: activeComplications(c).map((k) => ({ name: k.name, text: k.text })),
  };
}

export function load() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY));
    if (!c || c.v !== 1 || !c.active) return null;
    if (!Array.isArray(c.complications)) { rollComplications(c); save(c); } // pre-v2.4 run
    return c;
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
    graceUsed: false,
    lastLossScarred: false,
    resolve: 0,
    complications: [],
    extraComplication: 0,
    bonusDraft: 0,
    bonusTrim: 0,
    pending: null,
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
export function draftOptions(c, random = Math.random) {
  const owned = {};
  for (const id of c.deck) owned[id] = (owned[id] || 0) + 1;
  // upgrades are unique in play, so a second copy would be a dead draw
  const cap = (id) => (CARDS[id] && CARDS[id].type === "upgrade" ? 1 : 4);
  const pool = [...HERO_EXTRAS[c.heroId], ...RELICS].filter((id) => (owned[id] || 0) < cap(id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
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
export function applyWin(c, S, random = Math.random) {
  c.history.push({ act: c.act, villain: ACTS[c.act], result: "win", rounds: S.stats.rounds, dmg: S.stats.dmgDealt });
  if (S.hero.hp <= 2) c.scars++;
  c.extraDoom = S.scheme.stage >= 1 ? 1 : 0;
  c.resolve = 0;
  c.bonusDraft = 0;
  c.bonusTrim = 0;
  c.extraComplication = 0;
  c.graceUsed = false;
  c.pending = "cross"; // rewards are owed until the player actually takes them
  c.act++;
  rollComplications(c, random);
  save(c);
  return c;
}

export function applyLoss(c, S) {
  c.history.push({ act: c.act, villain: ACTS[c.act], result: "loss", rounds: S ? S.stats.rounds : 0, dmg: S ? S.stats.dmgDealt : 0 });
  if (c.graceUsed) {
    c.scars++;
    c.lastLossScarred = true;
  } else {
    c.graceUsed = true;
    c.lastLossScarred = false;
  }
  c.resolve = Math.min(2, (c.resolve || 0) + 1);
  save(c);
  return c;
}

export function setPending(c, step) {
  c.pending = step;
  save(c);
  return c;
}

export function finish(c) {
  c.active = false;
  save(c);
}
