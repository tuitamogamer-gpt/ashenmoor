// ============================================================
// ASHENMOOR — rules engine (pure game logic, no DOM)
// State is plain JSON (saveable / resumable mid villain phase).
// ============================================================
import { CONFIG } from "./config.js";
import { HEROES, CARDS, ENCOUNTERS, VILLAINS, SCHEME } from "./cards.js";
import { STR } from "../strings.js";
import { seedFrom, shuffle, randInt } from "./rng.js";

const L = STR.log;
const t = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : `{${k}}`));

// ---------- helpers ----------
const nuid = (S) => ++S.uidN;
export const heroDef = (S) => HEROES[S.heroId].def + modSum(S, "def");
export const heroAtk = (S) => HEROES[S.heroId].atk + modSum(S, "atk");
export const heroThw = (S) => HEROES[S.heroId].thw + modSum(S, "thw");
const modSum = (S, k) => S.upgrades.reduce((n, u) => n + ((CARDS[u.c].mod || {})[k] || 0), 0);
const crystals = (S) => S.upgrades.reduce((n, u) => n + ((CARDS[u.c].mod || {}).discount || 0), 0);
export const abilityLimit = (S) => 1 + modSum(S, "abilityCharges");
export const villainDef = (S) => VILLAINS[S.villainId];
export const stage = (S) => villainDef(S).stages[S.villain.stage];
export const hasOngoing = (S, key) => S.sideSchemes.some((ss) => ENCOUNTERS[ss.c].ongoing === key);
export const minionAtkVal = (S, m) => ENCOUNTERS[m.c].atk + (hasOngoing(S, "minionAtk1") ? 1 : 0);
export const villainAtkVal = (S) =>
  stage(S).atk + S.villain.atkBuff + (hasOngoing(S, "villainAtk1") ? 1 : 0) +
  S.villain.attachments.reduce((n, id) => n + ((ENCOUNTERS[id].mod || {}).atk || 0), 0);
export const villainSchVal = (S) =>
  stage(S).sch + S.villain.attachments.reduce((n, id) => n + ((ENCOUNTERS[id].mod || {}).sch || 0), 0);
export const schemeThreshold = (S) => villainDef(S).threshold[S.difficulty] ?? CONFIG.difficulty[S.difficulty].schemeThreshold;
const stageHp = (S, i) => villainDef(S).stages[i].hp + CONFIG.difficulty[S.difficulty].villainHpBonus;
export const intentFor = (S, round) =>
  villainDef(S).intentPattern === "thirdBell"
    ? (round % 3 === 0 ? "attack" : "scheme")
    : (round % 2 === 1 ? "attack" : "scheme");
export const handCard = (S, uid) => S.hand.find((h) => h.uid === uid);
export const resValue = (cid) => CARDS[cid].res || 1;

const anchorOf = (targetId) => (targetId === "villain" ? "villain" : "minion:" + targetId);
const toneOf = (card) => (card.faction === "sera" ? "teal" : card.faction === "neutral" ? "white" : "ember");

function log(S, msg, cls = "") {
  S.log.push({ msg, cls, r: S.round });
  if (S.log.length > CONFIG.logCap) S.log.splice(0, S.log.length - CONFIG.logCap);
}
function fx(S, o) { S.fx.push(o); }

// ---------- game setup ----------
export function newGame(heroId, villainId = "morvane", difficulty = "normal", seedStr = String(Date.now()), opts = {}) {
  const H = HEROES[heroId];
  const maxHp = Math.max(1, H.hp + (opts.maxHpMod || 0));
  const S = {
    v: 4, seed: seedStr, rng: seedFrom(seedStr), difficulty,
    uidN: 0, round: 1, phase: "player", intent: "attack",
    heroId, villainId, isCampaign: !!opts.isCampaign,
    hero: { hp: maxHp, maxHp, exhausted: false, shield: 0, abilityUsed: 0 },
    deck: [], hand: [], discard: [], allies: [], upgrades: [],
    villain: { stage: 0, hp: 0, atkBuff: 0, attachments: [], stun: 0, burn: 0 },
    scheme: { stage: 0, threat: 0 },
    sideSchemes: [],
    enc: { deck: [], discard: [] },
    minions: [],
    villainSealed: false, mulliganed: false, firstCardPlayed: false,
    vp: { queue: [], pending: null },
    fx: [], log: [], over: null,
    stats: { rounds: 1, dmgDealt: 0, threatRemoved: 0, cardsPlayed: 0, alliesLost: 0 },
  };
  S.villain.hp = stageHp(S, 0);
  S.intent = intentFor(S, 1);
  S.deck = shuffle(S, opts.deck && opts.deck.length ? opts.deck : H.deck);
  S.enc.deck = shuffle(S, villainDef(S).encDeck);
  if (opts.startDoom) S.scheme.threat = Math.min(opts.startDoom, schemeThreshold(S) - 1);
  draw(S, H.handSize);
  log(S, t(L.gameStart, { hero: H.name, villain: stage(S).title }), "sys");
  return S;
}

export function doMulligan(S, uids) {
  if (S.mulliganed || S.phase !== "player") return;
  S.mulliganed = true;
  if (!uids.length) return;
  const back = [];
  S.hand = S.hand.filter((h) => (uids.includes(h.uid) ? (back.push(h.c), false) : true));
  S.deck = shuffle(S, S.deck.concat(back));
  draw(S, back.length, true);
  log(S, t(L.mulligan, { n: back.length }), "sys");
}

// ---------- core mechanics ----------
function draw(S, n, silent = false) {
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (S.deck.length === 0) {
      if (S.discard.length === 0) break;
      S.deck = shuffle(S, S.discard);
      S.discard = [];
      log(S, L.reshuffle, "bad");
      fx(S, { kind: "threat", n: CONFIG.reshuffleDoom });
      addThreat(S, CONFIG.reshuffleDoom);
      if (S.over) return drawn;
    }
    if (S.hand.length >= CONFIG.handCap) break;
    S.hand.push({ uid: nuid(S), c: S.deck.pop() });
    drawn++;
  }
  if (drawn && !silent) { log(S, t(L.draw, { n: drawn }), ""); fx(S, { kind: "draw", n: drawn }); }
  return drawn;
}

export function addThreat(S, n) {
  if (S.over || n <= 0) return;
  S.scheme.threat += n;
  fx(S, { kind: "threat+", n, at: "scheme" });
  const th = schemeThreshold(S);
  if (S.scheme.threat >= th) {
    if (S.scheme.stage === 0) {
      S.scheme.stage = 1;
      S.scheme.threat = 0;
      S.villain.atkBuff += 1;
      S.villain.hp = Math.min(stageHp(S, S.villain.stage), S.villain.hp + 3);
      const advMsg = t(L.schemeAdvance, { v: villainDef(S).name });
      log(S, advMsg, "bad");
      fx(S, { kind: "banner", text: advMsg, tone: "bad" });
    } else {
      lose(S, "scheme");
    }
  }
}

function removeThreat(S, n) {
  const rem = Math.min(S.scheme.threat, n);
  S.scheme.threat -= rem;
  S.stats.threatRemoved += rem;
  if (rem > 0) fx(S, { kind: "threat-", n: rem, at: "scheme" });
  return rem;
}

// thwart router: "scheme" = main scheme, anything else = a side-scheme uid
function removeThreatFrom(S, targetId, n) {
  if (targetId && targetId !== "scheme") {
    const ss = S.sideSchemes.find((x) => x.uid === targetId);
    if (!ss) return 0;
    const rem = Math.min(ss.threat, n);
    ss.threat -= rem;
    S.stats.threatRemoved += rem;
    if (rem > 0) fx(S, { kind: "threat-", n: rem, at: "side:" + targetId });
    if (ss.threat <= 0) {
      S.sideSchemes = S.sideSchemes.filter((x) => x.uid !== targetId);
      S.enc.discard.push(ss.c);
      log(S, t(L.sideClear, { t: ENCOUNTERS[ss.c].name }), "good");
      fx(S, { kind: "sideClear" });
      const c = ENCOUNTERS[ss.c].clear || {};
      if (c.draw) draw(S, c.draw);
      if (c.heal) resolveEffect(S, { heal: c.heal });
      if (c.mainThwart) removeThreat(S, c.mainThwart);
    }
    return rem;
  }
  return removeThreat(S, n);
}
const thwartAnchor = (targetId) => (targetId && targetId !== "scheme" ? "side:" + targetId : "scheme");

function dmgVillain(S, n) {
  if (S.over || n <= 0) return;
  S.villain.hp -= n;
  S.stats.dmgDealt += n;
  fx(S, { kind: "dmg", n, at: "villain" });
  if (S.villain.hp <= 0) {
    log(S, t(L.stageDown, { stage: stage(S).title }), "good");
    fx(S, { kind: "shatter", at: "villain" });
    if (S.villain.stage >= villainDef(S).stages.length - 1) { win(S); return; }
    S.villain.stage++;
    S.villain.hp = stageHp(S, S.villain.stage);
    const st = stage(S);
    log(S, t(L.stageUp, { stage: st.title, hp: S.villain.hp }), "bad");
    fx(S, { kind: "banner", text: t(L.stageUp, { stage: st.title, hp: S.villain.hp }), tone: "stage" });
    if (st.onReveal) {
      if (st.onReveal.spawn) spawnMinion(S, st.onReveal.spawn);
      if (st.onReveal.threat) addThreat(S, st.onReveal.threat);
    }
  }
}

function dmgMinion(S, uid, n) {
  const m = S.minions.find((x) => x.uid === uid);
  if (!m || n <= 0) return;
  m.hp -= n;
  S.stats.dmgDealt += n;
  fx(S, { kind: "dmg", n, at: "minion:" + uid });
  if (m.hp <= 0) killMinion(S, uid);
}

function killMinion(S, uid) {
  const m = S.minions.find((x) => x.uid === uid);
  if (!m) return;
  S.minions = S.minions.filter((x) => x.uid !== uid);
  S.enc.discard.push(m.c);
  log(S, t(L.allyDown, { ally: ENCOUNTERS[m.c].name }).replace("destroyed", "defeated"), "good");
  fx(S, { kind: "kill", at: "minion:" + uid });
}

function dmgHero(S, n) {
  if (S.over || n <= 0) return;
  let d = n;
  if (S.hero.shield > 0) {
    const a = Math.min(S.hero.shield, d);
    S.hero.shield -= a; d -= a;
    if (a > 0) { log(S, t(L.shieldAbsorb, { n: a }), ""); fx(S, { kind: "shield", n: a }); }
  }
  if (d > 0) {
    const wasLow = S.hero.hp <= 3;
    S.hero.hp -= d;
    fx(S, { kind: "dmg", n: d, at: "hero" });
    if (S.hero.hp <= 0) { S.hero.hp = 0; lose(S, "hp"); }
    else if (S.hero.hp <= 3 && !wasLow) fx(S, { kind: "lowhp" });
  }
}

function dmgAlly(S, uid, n) {
  const a = S.allies.find((x) => x.uid === uid);
  if (!a || n <= 0) return;
  a.hp -= n;
  fx(S, { kind: "dmg", n, at: "ally:" + uid });
  if (a.hp <= 0) {
    S.allies = S.allies.filter((x) => x.uid !== uid);
    S.discard.push(a.c);
    S.stats.alliesLost++;
    log(S, t(L.allyDown, { ally: CARDS[a.c].name }), "bad");
    fx(S, { kind: "kill", at: "ally:" + uid });
  }
}

function healVillain(S, n) {
  const max = stageHp(S, S.villain.stage);
  const h = Math.min(n, max - S.villain.hp);
  if (h <= 0) { addThreat(S, 1); return; }
  S.villain.hp += h;
  log(S, t(L.healVillain, { v: villainDef(S).name, n: h }), "bad");
  fx(S, { kind: "heal", n: h, at: "villain" });
}

function spawnMinion(S, encId) {
  if (S.minions.length >= CONFIG.minionLimit) {
    log(S, L.minionCrowded, "bad");
    addThreat(S, CONFIG.crowdedDoom);
    return null;
  }
  const m = { uid: "m" + nuid(S), c: encId, hp: ENCOUNTERS[encId].hp };
  S.minions.push(m);
  log(S, t(L.minionSpawn, { m: ENCOUNTERS[encId].name }), "bad");
  fx(S, { kind: "spawn", at: "minion:" + m.uid });
  const sp = ENCOUNTERS[encId].spawn;
  if (sp && sp.threat) addThreat(S, sp.threat);
  return m;
}

function win(S) {
  if (S.over) return;
  S.over = { win: true, reason: "win" };
  S.phase = "over";
  log(S, L.win, "good");
  fx(S, { kind: "end", win: true });
}
function lose(S, reason) {
  if (S.over) return;
  S.over = { win: false, reason };
  S.phase = "over";
  log(S, reason === "hp" ? L.loseHp : L.loseScheme, "bad");
  fx(S, { kind: "end", win: false });
}

// ---------- costs & targets ----------
export function effCost(S, card) {
  if (card.cost == null) return null;
  const disc = S.firstCardPlayed ? 0 : crystals(S);
  return Math.max(0, card.cost - disc);
}

export function autoPay(S, uid) {
  // smallest waste, then fewest cards, to cover the cost
  const card = CARDS[handCard(S, uid).c];
  const cost = effCost(S, card);
  if (!cost) return [];
  const others = S.hand.filter((h) => h.uid !== uid);
  let best = null;
  const n = others.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    let sum = 0, cnt = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { sum += resValue(others[i].c); cnt++; }
    if (sum < cost) continue;
    const score = (sum - cost) * 100 + cnt;
    if (!best || score < best.score) best = { score, mask };
  }
  if (!best) return null;
  const ids = [];
  for (let i = 0; i < n; i++) if (best.mask & (1 << i)) ids.push(others[i].uid);
  return ids;
}

export function validTargets(S, spec) {
  if (spec === "minion") return S.minions.map((m) => m.uid);
  if (spec === "enemy") {
    const guarded = S.minions.some((m) => ENCOUNTERS[m.c].guard);
    return [...(guarded ? [] : ["villain"]), ...S.minions.map((m) => m.uid)];
  }
  if (spec === "scheme") return ["scheme", ...S.sideSchemes.map((ss) => ss.uid)];
  return [];
}

export function targetSpec(S, card) {
  const explicit = (card.effect && card.effect.target) || (card.enter && card.enter.target) || null;
  if (explicit) return explicit;
  if (card.effect && card.effect.thwart && S.sideSchemes.length) return "scheme";
  return null;
}

function dealToTarget(S, targetId, n) {
  if (targetId === "villain") dmgVillain(S, n);
  else dmgMinion(S, targetId, n);
}

function resolveEffect(S, ef, targetId, tone = "ember") {
  if (!ef) return;
  if (ef.dmg) {
    fx(S, { kind: "beam", from: "hero", to: anchorOf(targetId), tone });
    dealToTarget(S, targetId, ef.dmg);
  }
  if (ef.dmgAll) {
    fx(S, { kind: "nova", tone });
    dmgVillain(S, ef.dmgAll);
    for (const m of S.minions.slice()) { if (S.over) break; dmgMinion(S, m.uid, ef.dmgAll); }
  }
  if (ef.banish && targetId) {
    fx(S, { kind: "beam", from: "hero", to: anchorOf(targetId), tone });
    killMinion(S, targetId);
  }
  if (ef.thwart) {
    fx(S, { kind: "beam", from: "hero", to: thwartAnchor(targetId), tone: "teal" });
    removeThreatFrom(S, targetId || "scheme", ef.thwart);
  }
  if (ef.dmgVillain && !S.over) {
    fx(S, { kind: "beam", from: "hero", to: "villain", tone });
    dmgVillain(S, ef.dmgVillain);
  }
  if (ef.stun && !S.over) {
    S.villain.stun += ef.stun;
    log(S, t(L.stunApplied, { v: villainDef(S).name }), "good");
    fx(S, { kind: "stunfx" });
  }
  if (ef.burn && !S.over) {
    S.villain.burn += ef.burn;
    log(S, t(L.burnApplied, { v: villainDef(S).name, n: S.villain.burn }), "good");
    fx(S, { kind: "burnfx" });
  }
  if (ef.draw) draw(S, ef.draw);
  if (ef.heal) {
    const h = Math.min(ef.heal, S.hero.maxHp - S.hero.hp);
    if (h > 0) { S.hero.hp += h; log(S, t(L.heal, { hero: HEROES[S.heroId].name, n: h }), "good"); fx(S, { kind: "heal", n: h, at: "hero" }); }
  }
  if (ef.shield) { S.hero.shield += ef.shield; fx(S, { kind: "shield", n: ef.shield }); }
  if (ef.readyHero) S.hero.exhausted = false;
  if (ef.readyAllies) {
    for (const a of S.allies) a.exhausted = false;
    if (S.allies.length) { log(S, L.rally, "you"); fx(S, { kind: "rally" }); }
  }
  if (ef.seal) { S.villainSealed = true; }
  if (ef.selfDmg) dmgHero(S, ef.selfDmg);
}

// ---------- player actions (return null on success, error string otherwise) ----------
const A = STR.actions;

export function canAct(S) { return !S.over && S.phase === "player"; }

export function playCard(S, uid, payUids = [], targetId = null) {
  if (!canAct(S)) return "not now";
  const h = handCard(S, uid);
  if (!h) return "no card";
  const card = CARDS[h.c];
  if (card.type === "resource") return A.resourceOnly;
  if (card.type === "ally" && S.allies.length >= CONFIG.allyLimit) return A.allyLimit;
  if (card.effect && card.effect.banish && S.minions.length === 0) return A.needMinion;
  const cost = effCost(S, card);
  const paySet = [...new Set(payUids)].filter((p) => p !== uid && handCard(S, p));
  const sum = paySet.reduce((n, p) => n + resValue(handCard(S, p).c), 0);
  if (sum < cost) return A.cannotAfford;
  const spec = targetSpec(S, card);
  if (spec) {
    const valid = validTargets(S, spec);
    if (!valid.includes(targetId)) return A.chooseTarget;
  }
  // commit
  const paidNames = paySet.map((p) => CARDS[handCard(S, p).c].name);
  for (const p of paySet) {
    const e = handCard(S, p);
    S.hand = S.hand.filter((x) => x.uid !== p);
    S.discard.push(e.c);
  }
  S.hand = S.hand.filter((x) => x.uid !== uid);
  S.firstCardPlayed = true;
  S.stats.cardsPlayed++;
  log(S, t(L.playCard, { hero: HEROES[S.heroId].name, c: card.name }) + (paidNames.length ? " " + t(L.payed, { cards: paidNames.join(", ") }) : ""), "you");
  fx(S, { kind: "play", card: h.c });
  if (card.type === "event") {
    resolveEffect(S, card.effect, targetId, toneOf(card));
    S.discard.push(h.c);
  } else if (card.type === "ally") {
    const a = { uid: "a" + nuid(S), c: h.c, hp: card.hp, exhausted: false };
    S.allies.push(a);
    if (card.enter) resolveEffect(S, card.enter, targetId, toneOf(card));
  } else if (card.type === "upgrade") {
    S.upgrades.push({ uid: "u" + nuid(S), c: h.c });
  }
  return null;
}

export function basicAttack(S, targetId) {
  if (!canAct(S)) return "not now";
  if (S.hero.exhausted) return A.heroExhausted;
  const valid = validTargets(S, "enemy");
  if (!valid.includes(targetId)) return A.chooseTarget;
  S.hero.exhausted = true;
  const n = heroAtk(S);
  log(S, t(L.basicAttack, { who: HEROES[S.heroId].name, t: targetName(S, targetId), n }), "you");
  fx(S, { kind: "attack" });
  fx(S, { kind: "beam", from: "hero", to: anchorOf(targetId), tone: "ember" });
  dealToTarget(S, targetId, n);
  return null;
}

export function basicThwart(S, targetId = "scheme") {
  if (!canAct(S)) return "not now";
  if (S.hero.exhausted) return A.heroExhausted;
  S.hero.exhausted = true;
  const n = heroThw(S);
  fx(S, { kind: "beam", from: "hero", to: thwartAnchor(targetId), tone: "teal" });
  const rem = removeThreatFrom(S, targetId, n);
  log(S, t(L.basicThwart, { who: HEROES[S.heroId].name, n: rem }), "you");
  fx(S, { kind: "thwart" });
  return null;
}

export function heroAbility(S, targetId = null) {
  if (!canAct(S)) return "not now";
  if (S.hero.abilityUsed >= abilityLimit(S)) return A.abilityUsed;
  const kind = HEROES[S.heroId].ability.kind;
  if (kind === "dmg1") {
    const valid = validTargets(S, "enemy");
    if (!valid.includes(targetId)) return A.chooseTarget;
    S.hero.abilityUsed++;
    log(S, t(L.abilityKaelen, { t: targetName(S, targetId) }), "you");
    fx(S, { kind: "attack" });
    fx(S, { kind: "beam", from: "hero", to: anchorOf(targetId), tone: "ember" });
    dealToTarget(S, targetId, 1);
  } else if (kind === "shield1") {
    S.hero.abilityUsed++;
    S.hero.shield += 1;
    log(S, L.abilityOdran, "you");
    fx(S, { kind: "shield", n: 1 });
  } else {
    S.hero.abilityUsed++;
    const tgt = targetId || "scheme";
    fx(S, { kind: "beam", from: "hero", to: thwartAnchor(tgt), tone: "teal" });
    removeThreatFrom(S, tgt, 1);
    log(S, L.abilitySera, "you");
    fx(S, { kind: "thwart" });
  }
  return null;
}

export function allyAct(S, uid, mode, targetId = null) {
  if (!canAct(S)) return "not now";
  const a = S.allies.find((x) => x.uid === uid);
  if (!a) return "no ally";
  if (a.exhausted) return A.heroExhausted;
  const card = CARDS[a.c];
  a.exhausted = true;
  if (mode === "attack") {
    const valid = validTargets(S, "enemy");
    if (!valid.includes(targetId)) { a.exhausted = false; return A.chooseTarget; }
    const dmg = card.atk + modSum(S, "allyAtk");
    log(S, t(L.basicAttack, { who: card.name, t: targetName(S, targetId), n: dmg }), "you");
    fx(S, { kind: "attack" });
    fx(S, { kind: "beam", from: "ally:" + uid, to: anchorOf(targetId), tone: "ember" });
    dealToTarget(S, targetId, dmg);
  } else {
    const tgt = targetId || "scheme";
    fx(S, { kind: "beam", from: "ally:" + uid, to: thwartAnchor(tgt), tone: "teal" });
    const rem = removeThreatFrom(S, tgt, card.thw);
    log(S, t(L.basicThwart, { who: card.name, n: rem }), "you");
    fx(S, { kind: "thwart" });
  }
  if (!S.over) dmgAlly(S, uid, CONFIG.consequential);
  return null;
}

function targetName(S, targetId) {
  if (targetId === "villain") return stage(S).title;
  const m = S.minions.find((x) => x.uid === targetId);
  return m ? ENCOUNTERS[m.c].name : "?";
}

// ---------- villain phase ----------
export function endTurn(S) {
  if (!canAct(S)) return "not now";
  S.phase = "villain";
  S.vp = {
    queue: ["doom", "villain", ...S.minions.map((m) => "minion:" + m.uid), "reveal", "cleanup"],
    pending: null,
  };
  return null;
}

function queueAttack(S, attacker) {
  const isV = attacker.kind === "villain";
  const m = isV ? null : S.minions.find((x) => x.uid === attacker.uid);
  const dmg = isV ? villainAtkVal(S) : minionAtkVal(S, m);
  const name = isV ? stage(S).title : ENCOUNTERS[m.c].name;
  // villain attacks reveal a boost card from the encounter deck (extra hidden damage)
  let boost = 0, boostCard = null;
  if (isV) {
    if (S.enc.deck.length === 0 && S.enc.discard.length) {
      S.enc.deck = shuffle(S, S.enc.discard);
      S.enc.discard = [];
    }
    if (S.enc.deck.length) {
      boostCard = S.enc.deck.pop();
      S.enc.discard.push(boostCard);
      boost = ENCOUNTERS[boostCard].boost || 0;
    }
  }
  S.vp.pending = { attacker, name, dmg, boost, boostCard };
  fx(S, { kind: "incoming" });
}

export function stepVillain(S) {
  if (S.over || S.phase !== "villain" || S.vp.pending) return;
  const step = S.vp.queue.shift();
  if (!step) { S.phase = "player"; return; }
  if (step === "doom") {
    if (S.villain.burn > 0) {
      S.villain.burn--;
      log(S, t(L.burnTick, { v: villainDef(S).name }), "good");
      dmgVillain(S, 1);
      if (S.over) return;
    }
    const dn = CONFIG.doomPerRound + (hasOngoing(S, "doomPlus1") ? 1 : 0);
    log(S, t(L.doom, { n: dn }), "bad");
    fx(S, { kind: "doomPulse" });
    addThreat(S, dn);
  } else if (step === "villain") {
    if (S.villainSealed) {
      log(S, L.villainSealed, "good");
    } else if (S.intent === "attack") {
      if (S.villain.stun > 0) {
        S.villain.stun--;
        log(S, t(L.stunned, { v: stage(S).title }), "good");
        fx(S, { kind: "stunfx" });
      } else {
        log(S, t(L.villainAttack, { v: stage(S).title, n: villainAtkVal(S) }), "bad");
        fx(S, { kind: "loom" });
        queueAttack(S, { kind: "villain" });
      }
    } else {
      const n = villainSchVal(S);
      log(S, t(L.villainScheme, { v: stage(S).title, n }), "bad");
      addThreat(S, n);
    }
  } else if (step.startsWith("minion:")) {
    const uid = step.slice(7);
    const m = S.minions.find((x) => x.uid === uid);
    if (m) {
      log(S, t(L.minionAttack, { m: ENCOUNTERS[m.c].name, n: minionAtkVal(S, m) }), "bad");
      queueAttack(S, { kind: "minion", uid });
    }
  } else if (step === "reveal") {
    revealEncounter(S);
  } else if (step === "cleanup") {
    S.villainSealed = false;
    S.hero.exhausted = false;
    S.hero.shield = 0;
    S.hero.abilityUsed = 0;
    for (const a of S.allies) a.exhausted = false;
    S.firstCardPlayed = false;
    S.round++;
    S.stats.rounds = S.round;
    S.intent = intentFor(S, S.round);
    const H = HEROES[S.heroId];
    const refill = H.handSize - (hasOngoing(S, "handMinus1") ? 1 : 0);
    draw(S, Math.max(0, refill - S.hand.length));
    S.phase = "player";
    fx(S, { kind: "turn" });
    if (S.hero.hp <= 3) fx(S, { kind: "lowhp" });
    log(S, STR.phases.yourTurn, "sys");
  }
}

function revealEncounter(S) {
  if (S.enc.deck.length === 0) {
    S.enc.deck = shuffle(S, S.enc.discard);
    S.enc.discard = [];
    if (S.enc.deck.length === 0) return;
  }
  const id = S.enc.deck.pop();
  const e = ENCOUNTERS[id];
  log(S, t(L.reveal, { t: e.name }), "bad");
  fx(S, { kind: "reveal", card: id });
  if (e.type === "minion") {
    const m = spawnMinion(S, id);
    if (m && e.quickstrike && !S.over) {
      log(S, L.quickstrike, "bad");
      queueAttack(S, { kind: "minion", uid: m.uid });
    }
  } else if (e.type === "sidescheme") {
    if (S.sideSchemes.length >= 2) {
      S.enc.discard.push(id);
      log(S, L.sideCrowded, "bad");
      addThreat(S, 2);
    } else {
      const ss = { uid: "ss" + nuid(S), c: id, threat: e.enter };
      S.sideSchemes.push(ss);
      log(S, t(L.sideSpawn, { t: e.name, n: e.enter }), "bad");
      fx(S, { kind: "spawn", at: "side:" + ss.uid });
    }
  } else if (e.type === "attachment") {
    S.villain.attachments.push(id);
    log(S, t(L.attachment, { t: e.name }), "bad");
  } else {
    S.enc.discard.push(id);
    const f = e.fx || {};
    if (f.threat) addThreat(S, f.threat);
    if (f.threatBase) addThreat(S, f.threatBase + S.minions.length * (f.threatPerMinion || 0));
    if (f.exhaustAlly) {
      const ready = S.allies.filter((a) => !a.exhausted);
      if (ready.length) {
        const a = ready[randInt(S, ready.length)];
        a.exhausted = true;
        log(S, t(L.silvered, { ally: CARDS[a.c].name }), "bad");
      } else addThreat(S, 2);
    }
    if (f.villainAttack && !S.over) queueAttack(S, { kind: "villain" });
    if (f.discardRandom) {
      for (let i = 0; i < f.discardRandom && S.hand.length > 0; i++) {
        const idx = randInt(S, S.hand.length);
        const [gone] = S.hand.splice(idx, 1);
        S.discard.push(gone.c);
        log(S, t(L.discardRandom, { c: CARDS[gone.c].name }), "bad");
      }
      fx(S, { kind: "tear" });
    }
    if (f.healVillain) healVillain(S, f.healVillain);
    if (f.exhaustHero) {
      if (S.hero.exhausted) addThreat(S, 1);
      else { S.hero.exhausted = true; log(S, L.exhaustHero, "bad"); }
    }
  }
}

// choice: {kind:'take'} | {kind:'hero'} | {kind:'ally', uid}
export function applyDefense(S, choice) {
  const p = S.vp.pending;
  if (!p) return;
  S.vp.pending = null;
  const H = HEROES[S.heroId];
  const total = p.dmg + (p.boost || 0);
  if (p.boostCard) {
    log(S, t(L.boost, { t: ENCOUNTERS[p.boostCard].name, n: p.boost }), p.boost ? "bad" : "");
    fx(S, { kind: "boostReveal", card: p.boostCard, n: p.boost });
  }
  const fromA = p.attacker.kind === "villain" ? "villain" : "minion:" + p.attacker.uid;
  fx(S, { kind: "beam", from: fromA, to: choice.kind === "ally" ? "ally:" + choice.uid : "hero", tone: "void" });
  if (choice.kind === "hero" && !S.hero.exhausted) {
    S.hero.exhausted = true;
    const d = Math.max(0, total - heroDef(S));
    log(S, t(L.heroDefend, { hero: H.name, n: d }), "you");
    fx(S, { kind: "block" });
    dmgHero(S, d);
  } else if (choice.kind === "ally") {
    const a = S.allies.find((x) => x.uid === choice.uid);
    if (a && !a.exhausted) {
      a.exhausted = true;
      log(S, t(L.allyBlock, { ally: CARDS[a.c].name }), "you");
      fx(S, { kind: "block" });
      dmgAlly(S, choice.uid, total);
    } else {
      log(S, t(L.take, { hero: H.name, n: total }), "bad");
      dmgHero(S, total);
    }
  } else {
    log(S, t(L.take, { hero: H.name, n: total }), "bad");
    dmgHero(S, total);
  }
}

// dev/test hooks (?dev=1 panel and automated playtests)
export const dev = { dmgVillain, dmgHero, dmgMinion, draw, removeThreat, spawnMinion };

// defenders available for the pending attack (for the UI modal)
export function defenseOptions(S) {
  const p = S.vp.pending;
  if (!p) return null;
  return {
    name: p.name, dmg: p.dmg, boosted: !!p.boostCard,
    heroCanDefend: !S.hero.exhausted,
    heroDmgIfDefend: Math.max(0, p.dmg - heroDef(S)),
    allies: S.allies.filter((a) => !a.exhausted).map((a) => ({
      uid: a.uid, name: CARDS[a.c].name, dies: p.dmg >= a.hp,
    })),
  };
}
