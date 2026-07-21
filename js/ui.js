// ============================================================
// ASHENMOOR — UI: rendering, interaction, villain-phase driver
// ============================================================
import { STR } from "../strings.js";
import { CONFIG } from "./config.js";
import { HEROES, CARDS, ENCOUNTERS, VILLAINS, artPath } from "./cards.js";
import * as E from "./engine.js";
import * as CAMP from "./campaign.js";
import { sfx, setMuted, isMuted, setVolumes, floatText, shake, banner, startDrone, stopDrone, startMusic, stopMusic, setMusicStage } from "./fx.js";
import * as VFX from "./vfx.js";

const $ = (s, r = document) => r.querySelector(s);
const app = () => $("#app");
const tpl = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : `{${k}}`));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const QUERY = new URLSearchParams(location.search);
const DEV = QUERY.has("dev");
const TEST = QUERY.has("test");

let virtualNow = 0;
let virtualWaiters = [];

const sleep = (ms) => {
  if (!TEST) return new Promise((r) => setTimeout(r, ms));
  return new Promise((resolve) => {
    virtualWaiters.push({ at: virtualNow + Math.max(0, ms), resolve });
  });
};

let S = null;                 // game state
let mode = "idle";            // idle | pay | target
let sel = null;               // {kind:'hand'|'hero'|'ally'|'minion'|'villain'|'scheme', uid?}
let hoverPrev = null;         // transient preview
let payCtx = null;            // {uid, chosen:Set}
let targetCtx = null;         // {valid:[], label, onPick}
let running = false;          // villain driver active
let menuHero = null;
let menuVillain = "morvane";
let menuDiff = "normal";
let defenseResolve = null;    // pending defense promise resolver
let confirmAction = null;

function gameSnapshot() {
  if (!S) {
    return {
      screen: document.body.classList.contains("on-menu") ? "menu" : "loading",
      selectedHero: menuHero,
      selectedVillain: menuVillain,
      difficulty: menuDiff,
    };
  }
  const villain = E.stage(S);
  return {
    screen: S.over ? (S.over.win ? "victory" : "defeat") : S.phase,
    mode,
    running,
    round: S.round,
    difficulty: S.difficulty,
    dailyId: S.dailyId || null,
    intent: S.intent,
    hero: {
      id: S.heroId,
      hp: S.hero.hp,
      maxHp: S.hero.maxHp,
      shield: S.hero.shield,
      exhausted: S.hero.exhausted,
      abilityUsed: S.hero.abilityUsed,
    },
    villain: {
      id: S.villainId,
      stage: S.villain.stage + 1,
      title: villain.title,
      hp: S.villain.hp,
      stun: S.villain.stun,
      burn: S.villain.burn,
    },
    agenda: {
      stage: S.scheme.stage + 1,
      threat: S.scheme.threat,
      threshold: E.schemeThreshold(S),
      crisis: E.hasCrisis(S),
    },
    hand: S.hand.map((h) => ({
      uid: h.uid,
      id: h.c,
      cost: CARDS[h.c].type === "resource" ? "resource" : E.effCost(S, CARDS[h.c]),
    })),
    allies: S.allies.map((a) => ({ uid: a.uid, id: a.c, hp: a.hp, exhausted: a.exhausted })),
    minions: S.minions.map((m) => ({ uid: m.uid, id: m.c, hp: m.hp, tough: !!m.tough })),
    sideSchemes: S.sideSchemes.map((ss) => ({ uid: ss.uid, id: ss.c, threat: ss.threat })),
    pendingDefense: S.vp?.pending ? E.defenseOptions(S) : null,
    pendingReveal: S.vp?.revealed || null,
    over: S.over,
    coordinateSystem: "DOM card layout; actions target semantic IDs rather than coordinates.",
  };
}

window.render_game_to_text = () => JSON.stringify(gameSnapshot());
window.advanceTime = async (ms) => {
  if (!TEST) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
    return window.render_game_to_text();
  }
  const end = virtualNow + Math.max(0, ms);
  let guard = 0;
  while (guard++ < 1000) {
    virtualWaiters.sort((a, b) => a.at - b.at);
    const next = virtualWaiters[0];
    if (!next || next.at > end) break;
    virtualWaiters.shift();
    virtualNow = next.at;
    next.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  virtualNow = end;
  return window.render_game_to_text();
};

// ---------- prefs / save ----------
function prefs() {
  try { return JSON.parse(localStorage.getItem(CONFIG.prefsKey)) || {}; } catch { return {}; }
}
function setPrefs(p) {
  try { localStorage.setItem(CONFIG.prefsKey, JSON.stringify({ ...prefs(), ...p })); } catch {}
}
function save() {
  if (!S) return;
  try {
    if (S.over) localStorage.removeItem(CONFIG.saveKey);
    else localStorage.setItem(CONFIG.saveKey, JSON.stringify(S));
  } catch {}
}
function loadSave() {
  try {
    const raw = localStorage.getItem(CONFIG.saveKey);
    if (!raw) return null;
    const st = JSON.parse(raw);
    if (!st || st.v !== 5 || st.over) return null;
    st.fx = [];
    return st;
  } catch { return null; }
}

// ---------- boot ----------
const FINE = matchMedia("(pointer:fine)").matches;
const NOMOTION = matchMedia("(prefers-reduced-motion: reduce)").matches;
let tilted = null;

addEventListener("DOMContentLoaded", () => {
  setMuted(!!prefs().muted);
  menuHero = prefs().lastHero || "kaelen";
  menuVillain = prefs().lastVillain || "morvane";
  menuDiff = prefs().lastDiff || "normal";
  VFX.init();
  VFX.setAmbient(true);
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) {
      if (!(node instanceof HTMLElement)) continue;
      const modals = node.classList.contains("modal") ? [node] : [...node.querySelectorAll(".modal")];
      for (const modal of modals) {
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        const heading = modal.querySelector("h1,h2,h3,h4");
        if (heading) {
          if (!heading.id) heading.id = `dialog-title-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          modal.setAttribute("aria-labelledby", heading.id);
        }
        queueMicrotask(() => modal.querySelector("button:not(:disabled),input:not(:disabled)")?.focus());
      }
    }
  }).observe($("#overlays"), { childList: true, subtree: true });
  for (const id of ["vig-hurt", "vig-doom"]) {
    const d = document.createElement("div");
    d.id = id;
    document.body.appendChild(d);
  }
  if (window.__COOP__) coopBoot();
  else renderMenu();
  addEventListener("keydown", onKey);
  document.body.addEventListener("click", onClick);
  document.body.addEventListener("input", onInput);
  applySettings();
  document.body.addEventListener("dblclick", onDblClick);
  document.body.addEventListener("mouseover", onHover);
  document.body.addEventListener("mousemove", onTiltMove, { passive: true });
});

// 3D tilt on hand / hero-pick cards (desktop only) + menu parallax
function onTiltMove(e) {
  if (!FINE || NOMOTION) return;
  const menu = document.body.classList.contains("on-menu") ? $(".menu") : null;
  if (menu) {
    const dx = (e.clientX / innerWidth - 0.5) * -16;
    const dy = (e.clientY / innerHeight - 0.5) * -10;
    menu.style.backgroundPosition = `calc(50% + ${dx.toFixed(1)}px) calc(50% + ${dy.toFixed(1)}px)`;
  }
  const card = e.target.closest?.(".hcard, .pick, .vpick");
  const face = card ? (card.classList.contains("hcard") ? card.querySelector(".cardface") : card) : null;
  if (tilted && tilted !== face) { tilted.style.transform = ""; tilted = null; }
  if (!face) return;
  const r = card.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width - 0.5;
  const py = (e.clientY - r.top) / r.height - 0.5;
  face.style.transform = `perspective(700px) rotateX(${(-py * 9).toFixed(2)}deg) rotateY(${(px * 11).toFixed(2)}deg)`;
  tilted = face;
}

function pulseVig(id) {
  const el = document.getElementById(id);
  if (!el || NOMOTION) return;
  el.classList.add("on");
  setTimeout(() => el.classList.remove("on"), 420);
}

const anchorEl = (key) => (key ? document.querySelector(`[data-fx="${key}"]`) : null);

function onKey(e) {
  const openModals = [...document.querySelectorAll(".modal")];
  const topModal = openModals.at(-1);
  if (e.code === "Tab" && topModal) {
    const focusable = [...topModal.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')]
      .filter((node) => node.offsetParent !== null);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable.at(-1);
      if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); return; }
      if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); return; }
    }
  }
  const keyboardTarget = e.target?.closest?.('[role="button"][data-act]');
  if ((e.code === "Enter" || e.code === "Space") && keyboardTarget) {
    keyboardTarget.click();
    e.preventDefault();
  } else if (e.code === "Escape") { cancelModes(); closeTopModal(); render(); e.preventDefault(); }
  else if ((e.code === "Enter" || e.code === "NumpadEnter") && S && mode === "pay" && !$(".modal")) { confirmPay(); e.preventDefault(); }
  else if (e.code === "KeyE" && S && E.canAct(S) && mode === "idle" && !running && !$(".modal")) { doEndTurn(); e.preventDefault(); }
  else if (e.code === "KeyH") { toggleHelp(); e.preventDefault(); }
  else if (e.code === "KeyM") { toggleMute(); e.preventDefault(); }
  else if (e.code === "KeyF") { toggleFullscreen(); e.preventDefault(); }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {}
}

// ---------- player settings (persisted in prefs) ----------
const SPEEDS = { slow: 1.6, normal: 1, fast: 0.55 };
let speedMult = 1;
function applySettings() {
  const p = prefs();
  setVolumes(p.volMusic ?? 1, p.volSfx ?? 1);
  speedMult = SPEEDS[p.speed] ?? 1;
  document.documentElement.classList.toggle("no-motion", !!p.fxReduced);
  VFX.setIntensity(p.fxReduced ? 0.35 : 1);
}

// ---------- menu ----------
function renderMenu() {
  S = null;
  stopDrone();
  stopMusic();
  VFX.setIntensity(1);
  const hasSave = !!loadSave();
  const wins = prefs().wins || { total: 0 };
  const camp = CAMP.load();
  const dailyRecord = prefs().daily?.[localDateId()];
  const dailyLabel = dailyRecord?.bestRounds
    ? `${STR.menu.daily} · ✓ ${dailyRecord.bestRounds}R`
    : dailyRecord ? `${STR.menu.daily} · ${dailyRecord.attempts} played` : STR.menu.daily;
  document.body.className = "on-menu";
  app().innerHTML = `
  <div class="menu" style="background-image:linear-gradient(rgba(8,10,14,.55),rgba(8,10,14,.92)),url('${artPath("thumbnail")}')">
    <h1 class="title ${prefs().crowned ? "crowned" : ""}">${STR.title}</h1>
    <p class="subtitle">${STR.subtitle}${prefs().crowned ? ` · <span class="crown-mark">&#10038; ${STR.campaign.crowned}</span>` : ""}</p>
    <div class="menu-btns menu-actions">
      <div class="selection-summary"><b>${HEROES[menuHero].name}</b> vs <b>${VILLAINS[menuVillain].name}</b> · ${menuDiff}</div>
      <button class="btn primary" data-act="begin">${STR.menu.start}</button>
      ${hasSave ? `<button class="btn" data-act="continue">${STR.menu.continue}</button>` : ""}
      <button class="btn primary vigil-btn" data-act="campaign">${camp ? tpl(STR.campaign.menuContinue, { n: camp.act + 1 }) : STR.campaign.menuNew}</button>
      <button class="btn" data-act="daily">${dailyLabel}</button>
      <button class="btn" data-act="stats">${STR.menu.stats}</button>
      <button class="btn" data-act="howto">${STR.menu.howToPlay}</button>
      <button class="btn" data-act="settings">${STR.settings.title}</button>
      <button class="btn" data-act="mute">${STR.menu.mute}: ${isMuted() ? "OFF" : "ON"}</button>
    </div>
    <div class="first-vigil">${STR.menu.firstVigil}</div>
    <div class="hero-pick">
      ${Object.values(HEROES).map((h) => `
        <button type="button" class="pick ${menuHero === h.id ? "picked" : ""} f-${h.color}" data-act="choose-hero" data-id="${h.id}" aria-pressed="${menuHero === h.id}" aria-label="${esc(`Choose ${h.name}, ${h.title}`)}">
          <img src="${artPath(h.art)}" alt="">
          <div class="pick-name">${h.name}</div>
          <div class="pick-title">${h.title}</div>
          <div class="pick-stats">&#9876;${h.atk} &#10023;${h.thw} &#128737;${h.def} &#9829;${h.hp}</div>
          <div class="pick-ab"><b>${h.ability.name}:</b> ${h.ability.text}</div>
        </button>`).join("")}
    </div>
    <div class="vs-label">${STR.menu.chooseVillain}</div>
    <div class="villain-pick">
      ${Object.values(VILLAINS).map((v) => `
        <button type="button" class="vpick ${menuVillain === v.id ? "picked" : ""}" data-act="choose-villain" data-id="${v.id}" aria-pressed="${menuVillain === v.id}" aria-label="${esc(`Choose ${v.name}, ${v.epithet}`)}">
          <img src="${artPath(v.art)}" alt="">
          <div class="vp-body">
            <div class="pick-name">${v.name}</div>
            <div class="pick-title">${v.epithet}</div>
            <div class="pick-ab">${v.hint}</div>
          </div>
        </button>`).join("")}
    </div>
    <div class="diff-row">
      <span>${STR.menu.difficulty}:</span>
      <button class="seg ${menuDiff === "normal" ? "on" : ""}" data-act="diff" data-id="normal" aria-pressed="${menuDiff === "normal"}">${STR.menu.normal}</button>
      <button class="seg ${menuDiff === "nightmare" ? "on" : ""}" data-act="diff" data-id="nightmare" aria-pressed="${menuDiff === "nightmare"}">${STR.menu.nightmare}</button>
    </div>
    <p class="credits">${wins.total ? `${STR.menu.wins}: ${wins.total} · ` : ""}${STR.menu.version} · card art generated with OpenArt (Seedream 4.5)</p>
  </div>`;
}

// ---------- The Long Vigil (campaign) ----------
function renderCampaignHub() {
  const c = CAMP.load();
  if (!c) { renderMenu(); return; }
  S = null;
  stopDrone(); stopMusic(); VFX.setIntensity(1);
  document.body.className = "on-menu";
  const H = HEROES[c.heroId];
  app().innerHTML = `
  <div class="menu camp-hub" style="background-image:linear-gradient(rgba(8,10,14,.6),rgba(8,10,14,.93)),url('${artPath("campaign_road")}')">
    <h1 class="title small">${STR.campaign.title}</h1>
    <p class="subtitle">${STR.campaign.subtitle}</p>
    <div class="acts">
      ${CAMP.ACTS.map((vid, i) => {
        const v = VILLAINS[vid];
        const state = i < c.act ? "done" : i === c.act ? "current" : "locked";
        return `
        <div class="act-card ${state}">
          <img src="${artPath(v.art)}" alt="">
          <div class="act-label">${STR.campaign.act} ${["I", "II", "III"][i]}</div>
          <div class="pick-name">${v.name}</div>
          <div class="pick-title">${v.epithet}</div>
          <div class="act-state ${state}">${state === "done" ? STR.campaign.done : state === "current" ? STR.campaign.current : STR.campaign.locked}</div>
        </div>`;
      }).join("")}
    </div>
    <div class="camp-hero">
      <img src="${artPath(H.art)}" alt="">
      <div>
        <div class="pick-name">${H.name} <span class="pick-title" style="padding:0">· ${H.title}</span></div>
        <div class="camp-notes">
          ${c.scars ? `<div class="camp-note bad">${tpl(STR.campaign.scars, { n: c.scars })}</div>` : ""}
          ${c.extraDoom ? `<div class="camp-note bad">${tpl(STR.campaign.doomCarried, { n: c.extraDoom })}</div>` : ""}
          ${c.resolve ? `<div class="camp-note good">${tpl(STR.campaign.resolve, { n: c.resolve })}</div>` : ""}
          <div class="camp-note">${c.deck.length} ${STR.campaign.deckLabel} · ${c.difficulty}</div>
        </div>
      </div>
    </div>
    <div class="menu-btns">
      <button class="btn primary" data-act="camp-begin">${tpl(STR.campaign.begin, { n: c.act + 1 })}</button>
      <button class="btn" data-act="camp-deck">${tpl(STR.campaign.viewDeck, { n: c.deck.length })}</button>
      <button class="btn" data-act="camp-back">${STR.campaign.back}</button>
      <button class="btn danger" data-act="camp-abandon">${STR.campaign.abandon}</button>
    </div>
  </div>`;
}

function startCampaignGame() {
  const c = CAMP.load();
  if (!c || CAMP.isComplete(c)) { renderMenu(); return; }
  S = E.newGame(c.heroId, CAMP.ACTS[c.act], c.difficulty, String(Date.now()) + Math.random().toString(36).slice(2), {
    deck: c.deck, maxHpMod: -c.scars, startDoom: c.extraDoom,
    startShield: c.resolve || 0, openingHandBonus: c.resolve || 0, isCampaign: true,
  });
  startDrone(); startMusic(); setMusicStage(0); VFX.setIntensity(1);
  resetModes();
  document.body.className = "in-game";
  save();
  render();
  drainFx();
  showMulligan();
}

function draftModal(c) {
  const opts = CAMP.draftOptions(c);
  const el = document.createElement("div");
  el.className = "modal draft";
  el.innerHTML = `
    <div class="modal-box wide">
      <h3>${STR.campaign.draftTitle}</h3>
      <p>${STR.campaign.draftText}</p>
      <div class="mull-row">
        ${opts.map((cid) => `<button type="button" class="mcard draft-c" data-act="draft-pick" data-id="${cid}" aria-label="Add ${esc(CARDS[cid].name)} to the campaign deck">${playerCardHTML(cid)}</button>`).join("")}
      </div>
    </div>`;
  $("#overlays").appendChild(el);
  sfx.turn();
  VFX.rain("ember", 2000);
}

function trimModal(c) {
  const counts = {};
  for (const cid of c.deck) counts[cid] = (counts[cid] || 0) + 1;
  const can = CAMP.canRemove(c);
  const el = document.createElement("div");
  el.className = "modal trim";
  el.innerHTML = `
    <div class="modal-box wide">
      <h3>${STR.campaign.removeTitle}</h3>
      <p>${STR.campaign.removeText}</p>
      <div class="mull-row trim-row">
        ${Object.entries(counts).map(([cid, n]) => `
          <button type="button" class="mcard ${can ? "" : "noclick"}" data-act="trim-pick" data-id="${cid}" aria-label="Remove ${esc(CARDS[cid].name)} from the campaign deck" ${can ? "" : "disabled"}>
            ${playerCardHTML(cid)}
            <div class="count-badge">&times;${n}</div>
          </button>`).join("")}
      </div>
      <div class="row"><button class="btn primary" data-act="trim-skip">${STR.campaign.skip}</button></div>
    </div>`;
  $("#overlays").appendChild(el);
}

function epilogue(win, c) {
  const winsN = c.history.filter((h) => h.result === "win").length;
  const dmg = c.history.reduce((n, h) => n + h.dmg, 0);
  const rounds = c.history.reduce((n, h) => n + h.rounds, 0);
  const el = document.createElement("div");
  el.className = "modal ep";
  el.innerHTML = `
    <div class="modal-box end-box ${win ? "won" : "lost"} ep-box" style="background-image:linear-gradient(rgba(10,12,18,.88),rgba(10,12,18,.95)),url('${artPath("campaign_road")}')">
      <h2>${win ? STR.campaign.epWinTitle : STR.campaign.epFailTitle}</h2>
      <p class="end-reason">${win ? STR.campaign.epWinText : STR.campaign.epFailText}</p>
      <div class="end-stats">
        <div><b>${winsN}/3</b><span>Acts won</span></div>
        <div><b>${rounds}</b><span>Rounds</span></div>
        <div><b>${dmg}</b><span>Damage dealt</span></div>
        <div><b>${c.scars}</b><span>Scars</span></div>
      </div>
      <button class="btn primary" data-act="ep-close">${STR.campaign.newRun}</button>
    </div>`;
  $("#overlays").appendChild(el);
  if (win) { sfx.win(); VFX.rain("ember", 6000); }
  else { sfx.lose(); VFX.rain("ash", 5000); }
  CAMP.clear();
}

function startGame(options = {}) {
  const heroId = options.heroId || menuHero;
  const villainId = options.villainId || menuVillain;
  const difficulty = options.difficulty || menuDiff;
  const seed = options.seed || String(Date.now()) + Math.random().toString(36).slice(2);
  if (!options.dailyId) setPrefs({ lastHero: heroId, lastVillain: villainId, lastDiff: difficulty });
  S = E.newGame(heroId, villainId, difficulty, seed);
  if (options.dailyId) S.dailyId = options.dailyId;
  startDrone();
  startMusic();
  setMusicStage(0);
  VFX.setIntensity(1);
  resetModes();
  document.body.className = "in-game";
  save();
  render();
  drainFx();
  showMulligan();
}

function localDateId(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function startDaily() {
  const dailyId = localDateId();
  let hash = 2166136261;
  for (const ch of dailyId) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619) >>> 0;
  const heroIds = Object.keys(HEROES);
  const villainIds = Object.keys(VILLAINS);
  startGame({
    heroId: heroIds[hash % heroIds.length],
    villainId: villainIds[(hash >>> 8) % villainIds.length],
    difficulty: "normal",
    seed: `daily-${dailyId}`,
    dailyId,
  });
}

function openConfirm(title, text, confirmText, onConfirm) {
  confirmAction = onConfirm;
  const el = document.createElement("div");
  el.className = "modal confirm-modal";
  el.innerHTML = `
    <div class="modal-box confirm-box">
      <h3>${esc(title)}</h3>
      <p>${esc(text)}</p>
      <div class="row">
        <button class="btn" data-act="confirm-cancel">${STR.confirm.cancel}</button>
        <button class="btn danger" data-act="confirm-accept">${esc(confirmText)}</button>
      </div>
    </div>`;
  $("#overlays").appendChild(el);
}

function protectSavedBattle(onConfirm) {
  if (!loadSave()) { onConfirm(); return; }
  openConfirm(STR.confirm.replaceTitle, STR.confirm.replaceText, STR.confirm.replace, () => {
    localStorage.removeItem(CONFIG.saveKey);
    onConfirm();
  });
}

// ---------- global click routing ----------
function onClick(e) {
  const el = e.target.closest("[data-act]");
  const tgtEl = e.target.closest("[data-target]");
  // targeting mode: any valid [data-target] click resolves it
  if (mode === "target" && tgtEl && targetCtx && targetCtx.valid.includes(tgtEl.dataset.target)) {
    const pick = targetCtx.onPick;
    resetModes();
    pick(tgtEl.dataset.target);
    return;
  }
  if (!el) {
    if (e.target.closest(".inspector") || e.target.closest(".modal")) return;
    if (sel && !e.target.closest(".card")) { sel = null; render(); }
    return;
  }
  const actName = el.dataset.act;
  const id = el.dataset.id;
  const uid = el.dataset.uid ? (isNaN(+el.dataset.uid) ? el.dataset.uid : +el.dataset.uid) : el.dataset.uid;
  const H = {
    "choose-hero": () => { menuHero = id; sfx.click(); renderMenu(); },
    "choose-villain": () => { menuVillain = id; sfx.click(); renderMenu(); },
    "diff": () => { menuDiff = id; sfx.click(); renderMenu(); },
    "begin": () => { sfx.click(); protectSavedBattle(() => startGame()); },
    "daily": () => { sfx.click(); protectSavedBattle(() => startDaily()); },
    "stats": () => showStats(),
    "pile-filter": () => {
      const modal = el.closest(".modal");
      if (!modal) return;
      modal.dataset.filter = id || "all";
      modal.querySelectorAll('[data-act="pile-filter"]').forEach((b) => {
        const on = b.dataset.id === modal.dataset.filter;
        b.classList.toggle("primary", on);
        b.setAttribute("aria-pressed", String(on));
      });
      filterPileModal(modal);
    },
    "continue": () => { const st = loadSave(); if (st) { S = st; document.body.className = "in-game"; startDrone(); startMusic(); resetModes(); render(); if (S.phase === "villain") { vpLogStart = S.log.length; runVillain(); } } },
    "howto": () => toggleHelp(true),
    "mute": () => toggleMute(),
    "menu": () => { if (COOP.on) return; if (!running) openPauseMenu(); },
    "pm-help": () => { $(".modal.pausemenu")?.remove(); toggleHelp(true); },
    "pm-restart": () => {
      $(".modal.pausemenu")?.remove();
      openConfirm(STR.confirm.restartTitle, STR.confirm.restartText, STR.confirm.restart, () => {
        localStorage.removeItem(CONFIG.saveKey);
        if (S && S.isCampaign) startCampaignGame(); else startGame();
      });
    },
    "pm-mainmenu": () => { $(".modal.pausemenu")?.remove(); save(); renderMenu(); },
    "settings": () => openSettings(),
    "set-speed": () => { setPrefs({ speed: uid }); applySettings(); sfx.click(); document.querySelectorAll("[data-act='set-speed']").forEach((b) => b.classList.toggle("primary", b.dataset.uid === uid)); },
    "set-fx": () => { setPrefs({ fxReduced: uid === "reduced" }); applySettings(); sfx.click(); document.querySelectorAll("[data-act='set-fx']").forEach((b) => b.classList.toggle("primary", b.dataset.uid === uid)); },
    "coop-hero": () => { COOP.myHero = id; sfx.click(); renderCoopLobby(); coopMaybeStart(); },
    "coop-beacon": () => { coopSend({ type: "action", action: { kind: "beacon" } }); toast(STR.coop.beaconSent); sfx.rally(); },
    "coop-reset": () => { $(".modal.coop-final")?.remove(); coopSend({ type: "reset" }); },
    "help": () => toggleHelp(true),
    "log-toggle": () => { $(".game").classList.toggle("show-log"); },
    "close-modal": () => { el.closest(".modal").remove(); },
    "confirm-cancel": () => { confirmAction = null; el.closest(".modal")?.remove(); sfx.click(); },
    "confirm-accept": () => {
      const action = confirmAction;
      confirmAction = null;
      el.closest(".modal")?.remove();
      if (action) action();
    },
    "coach-close": () => { el.closest(".modal")?.remove(); },
    "inspector-close": () => { sel = null; hoverPrev = null; renderInspector(); },
    "hand": () => onHandClick(uid),
    "play": () => beginPlay(uid),
    "pay-confirm": () => confirmPay(),
    "pay-auto": () => { const a = E.autoPay(S, payCtx.uid); if (a) { payCtx.chosen = new Set(a); render(); } },
    "cancel": () => { cancelModes(); render(); },
    "end-turn": () => doEndTurn(),
    "basic-attack": () => heroAttackFlow(),
    "basic-thwart": () => thwartFlow(),
    "ability": () => abilityFlow(),
    "ally-attack": () => allyAttackFlow(uid),
    "ally-thwart": () => allyThwartFlow(uid),
    "ally": () => { sel = { kind: "ally", uid }; render(); },
    "minion": () => { sel = { kind: "minion", uid }; render(); },
    "side-scheme": () => {},
    "villain-card": () => { sel = { kind: "villain" }; render(); },
    "scheme": () => { sel = { kind: "scheme" }; render(); },
    "hero": () => { sel = { kind: "hero" }; render(); },
    "discard": () => showPile(STR.hud.discard, S.discard.map((c) => ({ kind: "p", id: c }))),
    "enc-discard": () => showPile(STR.hud.encounterDeck + " — " + STR.hud.discard, S.enc.discard.map((c) => ({ kind: "e", id: c }))),
    "reveal-resolve": () => {
      $(".modal.reveal-m")?.remove();
      if (revealResolve) { const r = revealResolve; revealResolve = null; r(); }
    },
    "agenda-continue": () => {
      $(".modal.agenda-m")?.remove();
      if (agendaResolveFn) { const r = agendaResolveFn; agendaResolveFn = null; r(); }
    },
    "def-take": () => resolveDefense({ kind: "take" }),
    "def-hero": () => resolveDefense({ kind: "hero" }),
    "def-ally": () => resolveDefense({ kind: "ally", uid }),
    "mull-keep": () => { $("#mull")?.remove(); act(() => (E.doMulligan(S, []), null)); showCoachOnce(); },
    "mull-redraw": () => {
      const picked = [...document.querySelectorAll("#mull .mcard.on")].map((x) => +x.dataset.uid);
      $("#mull")?.remove();
      act(() => (E.doMulligan(S, picked), null));
      showCoachOnce();
    },
    "mull-toggle": () => { el.classList.toggle("on"); el.setAttribute("aria-pressed", String(el.classList.contains("on"))); sfx.click(); },
    "again": () => { $(".modal.end")?.remove(); renderMenu(); },
    "restart": () => {
      if (COOP.on || running) return;
      openConfirm(STR.confirm.restartTitle, STR.confirm.restartText, STR.confirm.restart, () => {
        localStorage.removeItem(CONFIG.saveKey);
        if (S && S.isCampaign) startCampaignGame(); else startGame();
      });
    },
    "campaign": () => { sfx.click(); if (!CAMP.load()) CAMP.start(menuHero, menuDiff); renderCampaignHub(); },
    "camp-back": () => renderMenu(),
    "camp-begin": () => protectSavedBattle(() => startCampaignGame()),
    "camp-deck": () => { const c = CAMP.load(); if (c) showPile(STR.campaign.title, c.deck.map((cid) => ({ kind: "p", id: cid }))); },
    "camp-abandon": () => openConfirm(STR.confirm.abandonTitle, STR.confirm.abandonText, STR.confirm.abandon, () => {
      CAMP.clear(); localStorage.removeItem(CONFIG.saveKey); sfx.deny(); renderMenu();
    }),
    "camp-continue": () => {
      $(".modal.end")?.remove();
      const c = CAMP.load();
      if (!c || !S) { renderMenu(); return; }
      CAMP.applyWin(c, S);
      if (CAMP.isComplete(c)) { setPrefs({ crowned: true }); epilogue(true, c); }
      else draftModal(c);
    },
    "camp-retry": () => {
      $(".modal.end")?.remove();
      const c = CAMP.load();
      if (!c) { renderMenu(); return; }
      CAMP.applyLoss(c, S);
      if (CAMP.isDoomed(c)) epilogue(false, c);
      else renderCampaignHub();
    },
    "camp-abandon-end": () => openConfirm(STR.confirm.abandonTitle, STR.confirm.abandonText, STR.confirm.abandon, () => {
      $(".modal.end")?.remove(); CAMP.clear(); renderMenu();
    }),
    "draft-pick": () => {
      const c = CAMP.load();
      if (c && id) { CAMP.addCard(c, id); sfx.rally(); }
      $(".modal.draft")?.remove();
      if (c) trimModal(c);
    },
    "trim-pick": () => {
      const c = CAMP.load();
      if (c && id) { CAMP.removeCard(c, id); sfx.click(); }
      $(".modal.trim")?.remove();
      renderCampaignHub();
    },
    "trim-skip": () => { $(".modal.trim")?.remove(); renderCampaignHub(); },
    "ep-close": () => { $(".modal.ep")?.remove(); renderMenu(); },
  }[actName];
  if (H) H();
}

function onDblClick(e) {
  const el = e.target.closest('[data-act="hand"]');
  if (el && S && E.canAct(S) && mode === "idle") beginPlay(+el.dataset.uid);
}

function onHover(e) {
  if (!S || !matchMedia("(pointer:fine)").matches) return;
  const c = e.target.closest("[data-prev]");
  const next = c ? c.dataset.prev : null;
  if (next !== hoverPrev) { hoverPrev = next; renderInspector(); }
}

// ---------- interaction flows ----------
function onHandClick(uid) {
  if (!S || !E.canAct(S)) return;
  if (mode === "pay") {
    if (uid === payCtx.uid) return;
    if (payCtx.chosen.has(uid)) payCtx.chosen.delete(uid);
    else payCtx.chosen.add(uid);
    sfx.click();
    render();
    return;
  }
  if (sel && sel.kind === "hand" && sel.uid === uid) { beginPlay(uid); return; }
  sel = { kind: "hand", uid };
  sfx.click();
  render();
}

function beginPlay(uid) {
  if (!S || !E.canAct(S) || mode !== "idle" && mode !== "pay") return;
  const h = E.handCard(S, uid);
  if (!h) return;
  const card = CARDS[h.c];
  if (card.type === "resource") { toast(STR.actions.resourceOnly); sfx.deny(); return; }
  if (card.type === "ally" && S.allies.length >= CONFIG.allyLimit) { toast(STR.actions.allyLimit); sfx.deny(); return; }
  if (card.effect && card.effect.banish && S.minions.length === 0) { toast(STR.actions.needMinion); sfx.deny(); return; }
  const cost = E.effCost(S, card);
  if (cost > 0) {
    const auto = E.autoPay(S, uid);
    if (auto === null) { toast(STR.actions.cannotAfford); sfx.deny(); return; }
    mode = "pay";
    payCtx = { uid, chosen: new Set(auto) };
    sel = null;
    render();
    return;
  }
  afterPay(uid, []);
}

function confirmPay() {
  const { uid, chosen } = payCtx;
  const card = CARDS[E.handCard(S, uid).c];
  const sum = [...chosen].reduce((n, p) => n + E.resValue(E.handCard(S, p).c), 0);
  if (sum < E.effCost(S, card)) { toast(STR.actions.cannotAfford); sfx.deny(); return; }
  const pay = [...chosen];
  mode = "idle"; payCtx = null;
  afterPay(uid, pay);
}

function afterPay(uid, payIds) {
  const card = CARDS[E.handCard(S, uid).c];
  const spec = E.targetSpec(S, card);
  if (spec) {
    const valid = E.validTargets(S, spec);
    if (valid.length === 1) { act(() => E.playCard(S, uid, payIds, valid[0])); resetModes(); render(); return; }
    enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.playCard(S, uid, payIds, id)));
    return;
  }
  act(() => E.playCard(S, uid, payIds, null));
  resetModes();
  render();
  hintOnce("endTurn");
}

function heroAttackFlow() {
  if (S.hero.exhausted) { toast(STR.actions.heroExhausted); sfx.deny(); return; }
  const valid = E.validTargets(S, "enemy");
  if (valid.length === 1) { act(() => E.basicAttack(S, valid[0])); return; }
  enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.basicAttack(S, id)));
}

function abilityFlow() {
  if (S.hero.abilityUsed >= E.abilityLimit(S)) { toast(STR.actions.abilityUsed); sfx.deny(); return; }
  const kind = HEROES[S.heroId].ability.kind;
  if (kind === "dmg1") {
    const valid = E.validTargets(S, "enemy");
    if (valid.length === 1) { act(() => E.heroAbility(S, valid[0])); return; }
    enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.heroAbility(S, id)));
  } else if (kind === "thw1") {
    const valid = E.validTargets(S, "scheme");
    if (valid.length === 1) { act(() => E.heroAbility(S, valid[0])); return; }
    enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.heroAbility(S, id)));
  } else act(() => E.heroAbility(S));
}

function thwartFlow() {
  if (S.hero.exhausted) { toast(STR.actions.heroExhausted); sfx.deny(); return; }
  const valid = E.validTargets(S, "scheme");
  if (valid.length === 1) { act(() => E.basicThwart(S, valid[0])); return; }
  enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.basicThwart(S, id)));
}

function allyThwartFlow(uid) {
  const valid = E.validTargets(S, "scheme");
  if (valid.length === 1) { act(() => E.allyAct(S, uid, "thwart", valid[0])); return; }
  enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.allyAct(S, uid, "thwart", id)), `[data-fx="ally:${uid}"]`);
}

function allyAttackFlow(uid) {
  const valid = E.validTargets(S, "enemy");
  if (valid.length === 1) { act(() => E.allyAct(S, uid, "attack", valid[0])); return; }
  enterTarget(valid, STR.actions.chooseTarget, (id) => act(() => E.allyAct(S, uid, "attack", id)), `[data-fx="ally:${uid}"]`);
}

function enterTarget(valid, label, onPick, srcSel = '[data-fx="hero"]') {
  mode = "target";
  targetCtx = { valid, label, onPick };
  VFX.setTargetLine(srcSel);
  render();
}

function resetModes() { mode = "idle"; payCtx = null; targetCtx = null; sel = null; VFX.setTargetLine(null); }
function cancelModes() { if (mode !== "idle") sfx.click(); resetModes(); }

function act(fn) {
  const err = fn();
  if (err) { toast(err); sfx.deny(); }
  commit();
  return err;
}

function commit() {
  save();
  render();
  drainFx();
  if (S) {
    setMusicStage(S.villain.stage);
    VFX.setIntensity(S.villain.stage >= VILLAINS[S.villainId].stages.length - 1 ? 1.7 : 1);
  }
  if (COOP.on) { coopReport(!!(S && S.over)); renderPartnerPanel(); }
  if (S && S.over && !$(".modal.end")) setTimeout(showEnd, 900);
}

let vpLogStart = 0;

function doEndTurn() {
  if (!S || !E.canAct(S) || running) return;
  resetModes();
  vpLogStart = S.log.length;
  const err = E.endTurn(S);
  if (err) { toast(err); return; }
  commit();
  runVillain();
}

// ---------- villain phase driver ----------
async function runVillain() {
  if (running || !S) return;
  running = true;
  render();
  let lastLog = S.log.length;
  const announce = () => {
    const fresh = S.log.slice(lastLog);
    lastLog = S.log.length;
    if (fresh.length) banner(esc(fresh[0].msg.slice(0, 90)), "vp " + (fresh[0].cls || ""), 1150);
  };
  while (S && S.phase === "villain" && !S.over) {
    if (S.vp.pending) {
      render();
      const choice = await defenseModal(E.defenseOptions(S));
      E.applyDefense(S, choice);
      announce();
      commit();
      continue;
    }
    if (S.vp.revealed) {
      render();
      await revealModal(S.vp.revealed);
      E.resolveReveal(S);
      announce();
      commit();
      continue;
    }
    if (S.vp.agenda != null) {
      render();
      await agendaModal(S.vp.agenda);
      E.ackAgenda(S);
      announce();
      commit();
      continue;
    }
    await sleep(CONFIG.stepMs * speedMult);
    if (!S || S.phase !== "villain" || S.over) break;
    E.stepVillain(S);
    announce();
    commit();
  }
  running = false;
  render();
  if (S && !S.over && S.phase === "player") showRecap();
}

function showRecap() {
  const entries = S.log.slice(vpLogStart).filter((l) => l.msg !== STR.phases.yourTurn);
  if (!entries.length) return;
  const el = document.createElement("div");
  el.className = "modal recap";
  el.innerHTML = `
    <div class="modal-box">
      <h3>${STR.vp.recapTitle}</h3>
      <div class="recap-list">
        ${entries.map((l) => `<div class="l ${l.cls}">${esc(l.msg)}</div>`).join("")}
      </div>
      <button class="btn primary" data-act="close-modal">${STR.vp.begin}</button>
    </div>`;
  $("#overlays").appendChild(el);
  sfx.turn();
}

let agendaResolveFn = null;
function agendaModal(stageIdx) {
  return new Promise((resolve) => {
    agendaResolveFn = resolve;
    const agenda = E.agendaDef(S);
    const st = agenda.stages[stageIdx];
    const el = document.createElement("div");
    el.className = "modal reveal-m agenda-m";
    el.innerHTML = `
      <div class="modal-box reveal-box agenda-box">
        <h3>${STR.agenda.title}</h3>
        <div class="reveal-body">
          <div class="reveal-card"><div class="cardface pcard f-void">
            <div class="c-art"><img src="${artPath(agenda.art)}"></div>
            <div class="c-name">${agenda.name}</div>
            <div class="c-type">${tpl(STR.agenda.stageLabel, { n: stageIdx + 1, total: agenda.stages.length })} · ${esc(st.name)}</div>
          </div></div>
          <div class="reveal-notes">
            <p>${esc(st.text)}</p>
            <p class="dim">${STR.agenda.doomCarry}</p>
          </div>
        </div>
        <button class="btn primary" data-act="agenda-continue">${STR.agenda.face}</button>
      </div>`;
    $("#overlays").appendChild(el);
    sfx.stage();
    VFX.wave(innerWidth / 2, innerHeight / 2, "#a184ff", 160);
  });
}

let revealResolve = null;
function revealModal(eid) {
  return new Promise((resolve) => {
    revealResolve = resolve;
    const e = ENCOUNTERS[eid];
    const notes = [STR.reveal[e.type] || ""];
    if (e.type === "attachment") notes.push(STR.reveal.upgrade);
    if (e.crisis) notes.push(STR.reveal.crisis);
    if (e.quickstrike) notes.push(STR.reveal.quick);
    if (e.guard) notes.push(STR.reveal.guard);
    if (e.tough) notes.push(STR.reveal.tough);
    if (e.retaliate) notes.push(tpl(STR.reveal.retaliate, { n: e.retaliate }));
    if (e.surge) notes.push(STR.reveal.surge);
    if (e.haunt) notes.push(STR.reveal.haunt);
    const el = document.createElement("div");
    el.className = "modal reveal-m";
    el.innerHTML = `
      <div class="modal-box reveal-box">
        <h3>${STR.reveal.title}</h3>
        <div class="reveal-body">
          <div class="reveal-card">${encCardHTML(eid)}</div>
          <div class="reveal-notes">
            ${notes.map((n) => `<p>${n}</p>`).join("")}
          </div>
        </div>
        <button class="btn primary" data-act="reveal-resolve">${STR.reveal.resolve}</button>
      </div>`;
    $("#overlays").appendChild(el);
    sfx.reveal();
  });
}

function defenseModal(o) {
  return new Promise((resolve) => {
    defenseResolve = resolve;
    const q = o.boosted ? "+?" : "";
    const dmgStr = o.dmg + q;
    const host = $("#overlays");
    const el = document.createElement("div");
    el.className = "modal defense";
    el.innerHTML = `
      <div class="modal-box">
        <h3>${tpl(STR.defense.title, { attacker: esc(o.name), dmg: dmgStr })}</h3>
        ${o.boosted ? `<p class="boost-note">${STR.defense.boostNote}</p>` : ""}
        <div class="def-opts">
          ${o.heroCanDefend ? `<button class="btn" data-act="def-hero">${tpl(STR.defense.heroDefend, { dmg: o.heroDmgIfDefend + q })}</button>` : ""}
          ${o.allies.map((a) => `<button class="btn" data-act="def-ally" data-uid="${a.uid}">${tpl(STR.defense.allyBlock, { name: esc(a.name) })}${a.dies ? ` <span class="dies">(${STR.defense.allyDies})</span>` : ""}</button>`).join("")}
          <button class="btn danger" data-act="def-take">${tpl(STR.defense.take, { dmg: dmgStr })}</button>
        </div>
      </div>`;
    host.appendChild(el);
  });
}
function resolveDefense(choice) {
  $(".modal.defense")?.remove();
  if (defenseResolve) { const r = defenseResolve; defenseResolve = null; r(choice); }
}

// ---------- overlays ----------
function toast(msg) {
  const host = $("#overlays");
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), 1600);
  setTimeout(() => el.remove(), 2100);
}

function hintOnce(key) {
  const p = prefs();
  if (p["hint_" + key]) return;
  setPrefs({ ["hint_" + key]: 1 });
  toast(STR.hints[key]);
}

function showCoachOnce() {
  const p = prefs();
  if (p.coachSeen) return;
  setPrefs({ coachSeen: 1 });
  const el = document.createElement("div");
  el.className = "modal coach";
  el.innerHTML = `
    <div class="modal-box coach-box">
      <h3>${STR.coach.title}</h3>
      <p>${STR.coach.intro}</p>
      <ol class="coach-steps">${STR.coach.steps.map((step) => `<li>${step}</li>`).join("")}</ol>
      <button class="btn primary" data-act="coach-close">${STR.coach.go}</button>
    </div>`;
  $("#overlays").appendChild(el);
}

function showMulligan() {
  if (!S || S.mulliganed) return;
  const host = $("#overlays");
  const el = document.createElement("div");
  el.className = "modal";
  el.id = "mull";
  el.innerHTML = `
    <div class="modal-box wide">
      <h3>${STR.mulligan.title}</h3>
      <p>${STR.mulligan.text}</p>
      <div class="mull-row">
        ${S.hand.map((h) => `<button type="button" class="mcard" data-act="mull-toggle" data-uid="${h.uid}" aria-pressed="false" aria-label="${esc(`Redraw ${CARDS[h.c].name}`)}">${playerCardHTML(h.c)}</button>`).join("")}
      </div>
      <div class="row">
        <button class="btn primary" data-act="mull-keep">${STR.actions.keepHand}</button>
        <button class="btn" data-act="mull-redraw">${STR.actions.mulligan}</button>
      </div>
    </div>`;
  host.appendChild(el);
}

function showEnd() {
  if (!S || !S.over) return;
  if (COOP.on) { coopLocalEnd(); return; }
  const w = S.over.win;
  if (!S.statsRecorded) {
    S.statsRecorded = true;
    const p = prefs();
    const wins = p.wins || { total: 0 };
    if (w) {
      wins.total = (wins.total || 0) + 1;
      wins[S.heroId] = (wins[S.heroId] || 0) + 1;
    }
    const stats = p.stats || { games: 0, wins: 0, totalRounds: 0, byHero: {}, byVillain: {}, byDifficulty: {}, recent: [] };
    stats.byHero ||= {};
    stats.byVillain ||= {};
    stats.byDifficulty ||= {};
    stats.recent ||= [];
    const add = (group, id) => {
      group[id] ||= { games: 0, wins: 0 };
      group[id].games++;
      if (w) group[id].wins++;
    };
    stats.games++;
    if (w) stats.wins++;
    stats.totalRounds += S.stats.rounds;
    add(stats.byHero, S.heroId);
    add(stats.byVillain, S.villainId);
    add(stats.byDifficulty, S.difficulty);
    stats.recent.unshift({
      at: new Date().toISOString(), heroId: S.heroId, villainId: S.villainId,
      difficulty: S.difficulty, win: !!w, rounds: S.stats.rounds, dailyId: S.dailyId || null,
    });
    stats.recent = stats.recent.slice(0, 20);
    const daily = p.daily || {};
    if (S.dailyId) {
      const d = daily[S.dailyId] || { attempts: 0, wins: 0, bestRounds: null };
      d.attempts++;
      if (w) {
        d.wins++;
        d.bestRounds = d.bestRounds === null ? S.stats.rounds : Math.min(d.bestRounds, S.stats.rounds);
      }
      daily[S.dailyId] = d;
    }
    setPrefs({ wins, stats, daily });
  }
  const reason = w ? STR.end.winReason : S.over.reason === "hp" ? STR.end.loseHp : STR.end.loseScheme;
  const el = document.createElement("div");
  el.className = "modal end";
  el.innerHTML = `
    <div class="modal-box end-box ${w ? "won" : "lost"}">
      <h2>${w ? STR.end.victory : STR.end.defeat}</h2>
      <p class="end-reason">${reason}</p>
      <div class="end-stats">
        <div><b>${S.stats.rounds}</b><span>${STR.end.rounds}</span></div>
        <div><b>${S.stats.dmgDealt}</b><span>${STR.end.dmg}</span></div>
        <div><b>${S.stats.threatRemoved}</b><span>${STR.end.threat}</span></div>
        <div><b>${S.stats.cardsPlayed}</b><span>${STR.end.cards}</span></div>
      </div>
      <div class="row">${
        S.isCampaign && CAMP.load()
          ? (w
            ? `<button class="btn primary" data-act="camp-continue">${STR.campaign.continueVigil}</button>`
            : `<button class="btn primary" data-act="camp-retry">${STR.campaign.retryScar}</button>
               <button class="btn" data-act="camp-abandon-end">${STR.campaign.abandon}</button>`)
          : `<button class="btn primary" data-act="again">${STR.end.again}</button>`
      }</div>
    </div>`;
  $("#overlays").appendChild(el);
  save();
}

function pct(wins, games) {
  return games ? `${Math.round(100 * wins / games)}%` : "—";
}

function showStats() {
  const st = prefs().stats || { games: 0, wins: 0, totalRounds: 0, byHero: {}, recent: [] };
  const el = document.createElement("div");
  el.className = "modal stats-modal";
  const heroRows = Object.values(HEROES).map((h) => {
    const row = st.byHero?.[h.id] || { games: 0, wins: 0 };
    return `<div class="stat-row"><span>${h.name}</span><b>${row.wins}/${row.games}</b><em>${pct(row.wins, row.games)}</em></div>`;
  }).join("");
  const recent = (st.recent || []).slice(0, 8).map((r) => `
    <li class="${r.win ? "win" : "loss"}"><b>${r.win ? STR.stats.win : STR.stats.loss}</b> · ${HEROES[r.heroId]?.name || r.heroId} vs ${VILLAINS[r.villainId]?.name || r.villainId} · R${r.rounds}${r.dailyId ? ` · ${STR.stats.daily}` : ""}</li>`).join("");
  el.innerHTML = `
    <div class="modal-box stats-box">
      <h3>${STR.stats.title}</h3>
      <div class="stats-summary">
        <div><b>${st.games || 0}</b><span>${STR.stats.games}</span></div>
        <div><b>${st.wins || 0}</b><span>${STR.stats.wins}</span></div>
        <div><b>${pct(st.wins || 0, st.games || 0)}</b><span>${STR.stats.rate}</span></div>
        <div><b>${st.games ? (st.totalRounds / st.games).toFixed(1) : "—"}</b><span>${STR.stats.avgRounds}</span></div>
      </div>
      <h4>${STR.stats.byWarden}</h4>
      <div class="stat-table">${heroRows}</div>
      <h4>${STR.stats.recent}</h4>
      <ul class="recent-runs">${recent || `<li>${STR.stats.none}</li>`}</ul>
      <button class="btn primary" data-act="close-modal">${STR.help.close}</button>
    </div>`;
  $("#overlays").appendChild(el);
  sfx.click();
}

function toggleHelp(open) {
  const ex = $(".modal.help");
  if (ex && !open) { ex.remove(); return; }
  if (ex) return;
  const H = STR.help;
  const el = document.createElement("div");
  el.className = "modal help";
  el.innerHTML = `
    <div class="modal-box wide help-box">
      <h3>${H.title}</h3>
      <div class="help-body">
        <p class="help-goal">${H.goal}</p>

        <h4>${H.flowTitle}</h4>
        ${H.flow.map((s, i) => `<div class="hstep"><b>${i + 1}</b><span>${s}</span></div>`).join("")}

        <h4>${H.vpTitle}</h4>
        <p class="help-note">${H.vpNote}</p>
        ${H.vp.map((s, i) => `<div class="hstep vp"><b>${i + 1}</b><span>${s}</span></div>`).join("")}

        <h4>${H.anatomyTitle}</h4>
        <div class="anatomy">
          <div class="anatomy-card">${playerCardHTML("ember_slash")}</div>
          <div class="anatomy-card">${playerCardHTML("wardens_resolve")}</div>
          <ol>${H.anatomy.map((s) => `<li>${s}</li>`).join("")}</ol>
        </div>

        <h4>${H.legendTitle}</h4>
        <div class="legend">
          ${H.legend.map(([ic, n, d]) => `<div class="leg"><i>${ic}</i><div><b>${n}</b><span>${d}</span></div></div>`).join("")}
        </div>

        <h4>${H.moreTitle}</h4>
        ${H.body.map(([h, b]) => `<h5>${h}</h5><p>${b}</p>`).join("")}
      </div>
      <button class="btn primary" data-act="close-modal">${H.close}</button>
    </div>`;
  $("#overlays").appendChild(el);
}

function showPile(title, items) {
  const playerTypes = [...new Set(items.filter((it) => it.kind === "p").map((it) => CARDS[it.id]?.type).filter(Boolean))];
  const el = document.createElement("div");
  el.className = "modal";
  el.dataset.filter = "all";
  el.innerHTML = `
    <div class="modal-box wide">
      <h3>${esc(title)} (${items.length})</h3>
      ${playerTypes.length > 1 ? `<div class="pile-tools">
        <div class="pile-filters">
          <button class="btn small primary" data-act="pile-filter" data-id="all" aria-pressed="true">${STR.pile.all}</button>
          ${playerTypes.map((type) => `<button class="btn small" data-act="pile-filter" data-id="${type}" aria-pressed="false">${esc(type)}</button>`).join("")}
        </div>
        <input type="search" data-pile-search placeholder="${esc(STR.pile.search)}" aria-label="${esc(STR.pile.search)}">
      </div>` : ""}
      <div class="mull-row">
        ${items.map((it) => `<div class="mcard" data-type="${it.kind === "p" ? CARDS[it.id]?.type || "" : "encounter"}" data-name="${esc((it.kind === "p" ? CARDS[it.id]?.name : ENCOUNTERS[it.id]?.name) || it.id)}">${it.kind === "p" ? playerCardHTML(it.id) : encCardHTML(it.id)}</div>`).join("") || "<p>—</p>"}
        <p class="pile-empty" hidden>${STR.pile.empty}</p>
      </div>
      <button class="btn primary" data-act="close-modal">${STR.help.close}</button>
    </div>`;
  $("#overlays").appendChild(el);
}

function filterPileModal(modal) {
  const type = modal.dataset.filter || "all";
  const q = (modal.querySelector("[data-pile-search]")?.value || "").trim().toLowerCase();
  let shown = 0;
  modal.querySelectorAll(".mcard[data-type]").forEach((card) => {
    const visible = (type === "all" || card.dataset.type === type) && (!q || card.dataset.name.toLowerCase().includes(q));
    card.hidden = !visible;
    if (visible) shown++;
  });
  const empty = modal.querySelector(".pile-empty");
  if (empty) empty.hidden = shown !== 0;
}

// ---------- pause menu & settings ----------
function settingsHTML() {
  const p = prefs();
  const speed = p.speed || "normal";
  const spBtn = (id, label) => `<button class="btn small ${speed === id ? "primary" : ""}" data-act="set-speed" data-uid="${id}">${label}</button>`;
  return `
    <div class="settings">
      <label class="set-row"><span>${STR.settings.music}</span>
        <input type="range" min="0" max="100" value="${Math.round((p.volMusic ?? 1) * 100)}" data-vol="music"></label>
      <label class="set-row"><span>${STR.settings.sfx}</span>
        <input type="range" min="0" max="100" value="${Math.round((p.volSfx ?? 1) * 100)}" data-vol="sfx"></label>
      <div class="set-row"><span>${STR.settings.speed}</span>
        <div class="set-btns">${spBtn("slow", STR.settings.slow)}${spBtn("normal", STR.settings.normalSpeed)}${spBtn("fast", STR.settings.fast)}</div></div>
      <div class="set-row"><span>${STR.settings.effects}</span>
        <div class="set-btns">
          <button class="btn small ${p.fxReduced ? "" : "primary"}" data-act="set-fx" data-uid="full">${STR.settings.full}</button>
          <button class="btn small ${p.fxReduced ? "primary" : ""}" data-act="set-fx" data-uid="reduced">${STR.settings.reduced}</button>
        </div></div>
      <div class="set-keys">${STR.settings.shortcuts}</div>
    </div>`;
}

function openPauseMenu() {
  const el = document.createElement("div");
  el.className = "modal pausemenu";
  el.innerHTML = `
    <div class="modal-box pause-box">
      <h3>${STR.pause.title}</h3>
      <div class="pause-btns">
        <button class="btn primary" data-act="close-modal">${STR.pause.resume}</button>
        <button class="btn" data-act="pm-help">${STR.pause.howto}</button>
        <button class="btn" data-act="pm-restart">${STR.pause.restart}</button>
        <button class="btn danger" data-act="pm-mainmenu">${STR.pause.mainMenu}</button>
      </div>
      <h4>${STR.settings.title}</h4>
      ${settingsHTML()}
    </div>`;
  $("#overlays").appendChild(el);
  sfx.click();
}

function openSettings() {
  const el = document.createElement("div");
  el.className = "modal pausemenu";
  el.innerHTML = `
    <div class="modal-box pause-box">
      <h3>${STR.settings.title}</h3>
      ${settingsHTML()}
      <button class="btn primary" data-act="close-modal">${STR.help.close}</button>
    </div>`;
  $("#overlays").appendChild(el);
  sfx.click();
}

function onInput(e) {
  if (e.target?.matches?.("[data-pile-search]")) {
    filterPileModal(e.target.closest(".modal"));
    return;
  }
  const vol = e.target?.dataset?.vol;
  if (!vol) return;
  const v = (+e.target.value || 0) / 100;
  if (vol === "music") setPrefs({ volMusic: v });
  else { setPrefs({ volSfx: v }); sfx.click(); }
  applySettings();
}

function closeTopModal() {
  const m = [...document.querySelectorAll(".modal")].filter((x) => !x.classList.contains("defense") && !x.classList.contains("end")).pop();
  if (!m) return;
  if (m.classList.contains("confirm-modal")) confirmAction = null;
  // reveal/agenda modals gate an awaited promise in runVillain — Escape must
  // resolve them like their button would, or the villain phase locks forever
  if (m.classList.contains("agenda-m")) {
    m.remove();
    if (agendaResolveFn) { const r = agendaResolveFn; agendaResolveFn = null; r(); }
    return;
  }
  if (m.classList.contains("reveal-m")) {
    m.remove();
    if (revealResolve) { const r = revealResolve; revealResolve = null; r(); }
    return;
  }
  m.remove();
}

function toggleMute() {
  setMuted(!isMuted());
  setPrefs({ muted: isMuted() });
  if (S) render(); else renderMenu();
}

// ---------- card HTML builders ----------
function statChip(sym, n, cls = "") { return `<span class="stat ${cls}">${sym}${n}</span>`; }

function playerCardHTML(cid, opts = {}) {
  const c = CARDS[cid];
  const cost = c.cost == null ? `<div class="c-cost res">${c.res || 1}</div>` : `<div class="c-cost">${opts.cost !== undefined ? opts.cost : c.cost}</div>`;
  const stats = c.type === "ally"
    ? `<div class="c-stats">${statChip("&#9876;", c.atk)}${statChip("&#10023;", c.thw)}${statChip("&#9829;", opts.hp !== undefined ? opts.hp : c.hp, "hp")}</div>` : "";
  return `
    <div class="cardface pcard f-${c.faction} t-${c.type}">
      ${cost}
      <div class="c-art"><img src="${artPath(cid)}" alt="" draggable="false" loading="lazy"></div>
      <div class="c-name">${c.name}</div>
      <div class="c-type">${c.type.toUpperCase()}</div>
      <div class="c-text">${c.text}</div>
      ${stats}
    </div>`;
}

function encCardHTML(eid, opts = {}) {
  const c = ENCOUNTERS[eid];
  const stats = c.type === "minion"
    ? `<div class="c-stats">${statChip("&#9876;", c.atk)}${statChip("&#9829;", opts.hp !== undefined ? opts.hp : c.hp, "hp")}</div>` : "";
  return `
    <div class="cardface pcard f-void t-${c.type}">
      ${c.boost ? `<div class="bpips" title="Boost">${"&#9670;".repeat(c.boost)}</div>` : ""}
      <div class="c-art"><img src="${artPath(eid)}" alt="" draggable="false" loading="lazy"></div>
      <div class="c-name">${c.name}</div>
      <div class="c-type">${c.type.toUpperCase()}</div>
      <div class="c-text">${c.text}</div>
      ${stats}
    </div>`;
}

// small chips summarizing the agenda stage's ongoing twist
function agendaOngoingChips(aStage) {
  const o = aStage.ongoing || {};
  const parts = [];
  if (o.atk) parts.push(`&#9876;+${o.atk}`);
  if (o.sch) parts.push(`&#9737;+${o.sch}`);
  if (o.minionAtk) parts.push(`minions &#9876;+${o.minionAtk}`);
  if (o.doomPerRound) parts.push(`&#9670;+${o.doomPerRound}/rd`);
  return parts.map((p) => `<span class="agchip">${p}</span>`).join("");
}

// ---------- main render ----------
function render() {
  if (!S) return;
  const H = HEROES[S.heroId];
  const st = E.stage(S);
  const th = E.schemeThreshold(S);
  const agenda = E.agendaDef(S);
  const aStage = E.agendaStage(S);
  const crisisLock = E.hasCrisis(S);
  const agendaChips = agendaOngoingChips(aStage);
  const intentTxt = S.villainSealed ? STR.hud.intentSealed
    : S.intent === "attack" && S.villain.stun > 0 ? STR.hud.intentStunned
    : S.intent === "attack" ? `${STR.hud.intentAttack} ${E.villainAtkVal(S)}+?`
    : `${STR.hud.intentScheme} +${E.villainSchVal(S)}`;

  const minionsHTML = S.minions.map((m) => {
    const e = ENCOUNTERS[m.c];
    return `
    <div class="card minion ${targetable(m.uid)}" data-target="${m.uid}" data-act="minion" data-prev="e:${m.c}" data-fx="minion:${m.uid}" role="button" tabindex="0" aria-label="Inspect ${esc(e.name)}, ${m.hp} health">
      <div class="c-art"><img src="${artPath(m.c)}" alt=""></div>
      <div class="c-name">${e.name}</div>
      <div class="c-stats">${statChip("&#9876;", e.atk)}${statChip("&#9829;", m.hp, "hp")}</div>
      ${e.quickstrike ? '<div class="kw">QUICK</div>' : ""}
      ${e.guard ? '<div class="kw guard">GUARD</div>' : ""}
      ${m.tough ? `<div class="kw tough" data-tip="${esc(STR.reveal.tough)}">TOUGH</div>` : ""}
      ${e.retaliate ? `<div class="kw ret" data-tip="${esc(tpl(STR.reveal.retaliate, { n: e.retaliate }))}">RET ${e.retaliate}</div>` : ""}
      ${e.haunt ? `<div class="kw haunt" data-tip="${esc(STR.reveal.haunt)}">HAUNT</div>` : ""}
    </div>`;
  }).join("");

  // upgrades can grant Disrupt to allies (beast_bond) — show and gate on the MODIFIED value
  const allyThwBonus = S.upgrades.reduce((n, u) => n + ((CARDS[u.c].mod || {}).allyThw || 0), 0);
  const alliesHTML = S.allies.map((a) => {
    const c = CARDS[a.c];
    const thwVal = c.thw + allyThwBonus;
    const canUse = E.canAct(S) && !a.exhausted && mode === "idle" && !running;
    return `
    <div class="card ally ${a.exhausted ? "exhausted" : ""}" data-act="ally" data-uid="${a.uid}" data-prev="p:${a.c}" data-fx="ally:${a.uid}" role="group" aria-label="${esc(c.name)}, ${a.hp} health${a.exhausted ? ", exhausted" : ""}">
      <div class="c-art"><img src="${artPath(a.c)}" alt=""></div>
      <div class="c-name">${c.name}</div>
      <div class="c-stats">${statChip("&#9876;", c.atk)}${statChip("&#10023;", thwVal)}${statChip("&#9829;", a.hp, "hp")}</div>
      ${canUse ? `<div class="mini-btns">
          ${c.atk > 0 ? `<button class="mini" data-act="ally-attack" data-uid="${a.uid}" data-tip="${esc(STR.tips.allyAttack)}" aria-label="${esc(`${c.name}: attack`)}">&#9876;</button>` : ""}
          ${thwVal > 0 ? `<button class="mini" data-act="ally-thwart" data-uid="${a.uid}" data-tip="${esc(STR.tips.allyThwart)}" aria-label="${esc(`${c.name}: disrupt`)}">&#10023;</button>` : ""}
        </div>` : ""}
    </div>`;
  }).join("");

  const upgradesHTML = S.upgrades.map((u) => `
    <div class="chip upgrade" data-prev="p:${u.c}">${CARDS[u.c].name}</div>`).join("");

  const attachHTML = S.villain.attachments.map((id) => `
    <div class="chip attach" data-prev="e:${id}" data-tip="${esc(ENCOUNTERS[id].text)}">&#9960; ${ENCOUNTERS[id].name}</div>`).join("");

  const sideHTML = S.sideSchemes.map((ss) => {
    const e = ENCOUNTERS[ss.c];
    return `
    <div class="card sscard ${targetable(ss.uid)} ${e.crisis ? "crisis" : ""}" data-target="${ss.uid}" data-act="side-scheme" data-prev="e:${ss.c}" data-fx="side:${ss.uid}" role="button" ${mode === "target" ? 'tabindex="0"' : 'tabindex="-1"'} aria-label="${esc(`${e.name}, ${ss.threat} doom`)}">
      <div class="c-art"><img src="${artPath(ss.c)}" alt=""></div>
      <div class="c-name">${e.name}</div>
      <div class="ss-threat ${e.burst && ss.threat >= e.burst.at - 2 ? "near-burst" : ""}">&#9670; <b>${ss.threat}</b>${e.burst ? `<span class="burst-at" data-tip="${esc(STR.tips.burst)}">/${e.burst.at}&#128165;</span>` : ""}</div>
      ${e.crisis ? `<div class="kw crisis-kw" data-tip="${esc(STR.tips.crisis)}">&#128274; CRISIS</div>` : ""}
    </div>`;
  }).join("");

  const handN = S.hand.length;
  const handHTML = S.hand.map((h, hi) => {
    const c = CARDS[h.c];
    const staged = mode === "pay" && payCtx.uid === h.uid;
    const chosen = mode === "pay" && payCtx.chosen.has(h.uid);
    const selected = sel && sel.kind === "hand" && sel.uid === h.uid;
    const cost = E.effCost(S, c);
    const off = hi - (handN - 1) / 2;
    const fan = `--fr:${(off * 2.2).toFixed(2)}deg;--fy:${(Math.abs(off) * 5).toFixed(1)}px`;
    const payPool = S.hand.filter((x) => x.uid !== h.uid).reduce((n, x) => n + E.resValue(x.c), 0);
    const canplay = E.canAct(S) && mode === "idle" && !running && c.type !== "resource" && cost <= payPool
      && !(c.type === "ally" && S.allies.length >= CONFIG.allyLimit)
      && !(c.effect && c.effect.banish && S.minions.length === 0);
    return `
    <button type="button" class="card hcard ${staged ? "staged" : ""} ${chosen ? "pay-chosen" : ""} ${selected ? "selected" : ""} ${canplay ? "canplay" : ""}"
         style="${fan}" data-act="hand" data-uid="${h.uid}" data-prev="p:${h.c}" aria-pressed="${!!selected}" aria-label="${esc(`${c.name}, ${c.type}, cost ${cost}`)}">
      ${playerCardHTML(h.c, { cost })}
      ${chosen ? `<div class="pay-badge">+${E.resValue(h.c)}</div>` : ""}
    </button>`;
  }).join("");

  const heroBtns = E.canAct(S) && mode === "idle" && !running ? `
    <div class="hero-actions">
      <button class="btn small ${S.hero.exhausted ? "off" : ""}" data-act="basic-attack" data-tip="${esc(STR.tips.attack)}" ${S.hero.exhausted ? "disabled" : ""}>&#9876; ${STR.actions.attack} ${E.heroAtk(S)}</button>
      <button class="btn small ${S.hero.exhausted ? "off" : ""}" data-act="basic-thwart" data-tip="${esc(STR.tips.disrupt)}" ${S.hero.exhausted ? "disabled" : ""}>&#10023; ${STR.actions.thwart} ${E.heroThw(S)}</button>
      <button class="btn small ability ${S.hero.abilityUsed >= E.abilityLimit(S) ? "off" : ""}" data-act="ability" data-tip="${esc(H.ability.name + ": " + H.ability.text)}" ${S.hero.abilityUsed >= E.abilityLimit(S) ? "disabled" : ""}>&#10038; ${H.ability.name}</button>
    </div>` : "";

  // condensed mana tracker, LEFT side by the hero: shows the hand's resource
  // pool at rest and becomes the pay/target controls when a card is staged
  const payPool = S.hand.reduce((n, h) => n + E.resValue(h.c), 0);
  const payBar = mode === "pay" ? (() => {
    const card = CARDS[E.handCard(S, payCtx.uid).c];
    const need = E.effCost(S, card);
    const sum = [...payCtx.chosen].reduce((n, p) => n + E.resValue(E.handCard(S, p).c), 0);
    const ok = sum >= need;
    return `
      <div class="action-dock paying">
        <div class="dock-count ${ok ? "ok" : ""}">${sum}<span>/${need}</span></div>
        <div class="dock-row">
          <button class="dock-btn confirm ${ok ? "" : "off"}" data-act="pay-confirm" data-tip="${esc(STR.dock.confirm)}" aria-label="${esc(STR.dock.confirm)}" ${ok ? "" : "disabled"}>&#10003;</button>
          <button class="dock-btn" data-act="pay-auto" data-tip="${esc(STR.dock.auto)}" aria-label="${esc(STR.dock.auto)}">&#10227;</button>
          <button class="dock-btn danger" data-act="cancel" data-tip="${esc(STR.dock.cancel)}" aria-label="${esc(STR.dock.cancel)}">&#10005;</button>
        </div>
      </div>`;
  })() : "";

  const targetBar = mode === "target" ? `
    <div class="action-dock target-dock">
      <div class="dock-label">${targetCtx.label}</div>
      <button class="dock-btn danger" data-act="cancel" data-tip="${esc(STR.dock.cancel)}" aria-label="${esc(STR.dock.cancel)}">&#10005;</button>
    </div>` : "";

  const manaChip = mode === "idle" && !running && E.canAct(S) ? `
    <div class="action-dock mana-idle" data-tip="${esc(STR.dock.pool)}">&#10023; ${payPool}</div>` : "";

  document.body.className = "in-game";
  const prevBars = captureBars();
  app().innerHTML = `
  <div class="game ${$(".game")?.classList.contains("show-log") ? "show-log" : ""} ${mode === "target" ? "targeting" : ""} ${S.villain.stage >= VILLAINS[S.villainId].stages.length - 1 ? "enrage" : ""} ${S.hero.hp <= 3 ? "lowhp" : ""}">
    <header class="topbar">
      <button class="btn small" data-act="menu">${STR.hud.menu}</button>
      <div class="round-pill">${S.dailyId ? `<span class="daily-tag">${STR.menu.daily}</span> · ` : ""}${STR.hud.round} <b>${S.round}</b> · ${STR.hud.intent}: <b class="int-${S.intent}" data-tip="${esc(STR.tips.intent)}">${intentTxt}</b></div>
      <div class="top-right">
        <button class="btn small" data-act="restart">${STR.hud.restart}</button>
        <button class="btn small" data-act="help" aria-label="${esc(STR.hud.help)}">?</button>
        <button class="btn small" data-act="mute" aria-label="${esc(STR.menu.mute)}">${isMuted() ? "&#128263;" : "&#128266;"}</button>
        <button class="btn small log-btn" data-act="log-toggle">${STR.hud.log}</button>
      </div>
    </header>
    ${payBar}${targetBar}${manaChip}
    <section class="villain-zone">
      <div class="piles">
        <div class="pile" data-tip="${esc(STR.tips.encDeck)}">
          <img src="${artPath("cardback")}" alt="">
          <span class="count">${S.enc.deck.length}</span>
        </div>
        <div class="pile flat" data-act="enc-discard" data-tip="${esc(STR.tips.discard)}" role="button" tabindex="0" aria-label="${esc(STR.hud.encounterDeck + " " + STR.hud.discard)}">
          <span class="count">${S.enc.discard.length}</span>
        </div>
      </div>
      <div class="card villain ${targetable("villain")}" data-target="villain" data-act="villain-card" data-prev="v" data-fx="villain" role="button" tabindex="0" aria-label="${esc(`${st.title}, ${S.villain.hp} health`)}">
        <div class="c-art"><img src="${artPath(VILLAINS[S.villainId].art)}" alt=""></div>
        <div class="stage-pips">${VILLAINS[S.villainId].stages.map((_, i) => `<i class="${i <= S.villain.stage ? "on" : ""}"></i>`).join("")}</div>
        ${S.villain.stun > 0 ? `<div class="vchip stun">&#9889;${S.villain.stun}</div>` : ""}
        ${S.villain.burn > 0 ? `<div class="vchip burn">&#128293;${S.villain.burn}</div>` : ""}
        <div class="c-name">${st.title}</div>
        ${VILLAINS[S.villainId].keyword ? `<div class="vkeyword" data-tip="${esc(VILLAINS[S.villainId].keyword.text)}">&#128081; ${VILLAINS[S.villainId].keyword.name}</div>` : ""}
        <div class="c-stats">
          ${statChip("&#9876;", E.villainAtkVal(S))}${statChip("&#9737;", E.villainSchVal(S))}
        </div>
        ${hpbarHTML("", Math.max(0, 100 * S.villain.hp / (st.hp + CONFIG.difficulty[S.difficulty].villainHpBonus)), String(S.villain.hp))}
        ${attachHTML ? `<div class="chips">${attachHTML}</div>` : ""}
      </div>
      <div class="card scheme ${targetable("scheme")} ${crisisLock ? "crisis-locked" : ""}" data-target="scheme" data-act="scheme" data-prev="s" data-fx="scheme" role="button" tabindex="0" aria-label="${esc(`${agenda.name}, ${S.scheme.threat} of ${th} doom`)}">
        <div class="c-art"><img src="${artPath(agenda.art)}" alt=""></div>
        ${crisisLock ? `<div class="crisis-lock" data-tip="${esc(STR.tips.crisis)}">&#128274;</div>` : ""}
        <div class="c-name">${agenda.name}</div>
        <div class="threat-track" data-tip="${esc(STR.tips.doom)}">
          <b class="tnum">${S.scheme.threat}<span>/${th}</span></b>
          <div class="pips">${Array.from({ length: th }, (_, i) => `<i class="${i < S.scheme.threat ? "on" : ""}"></i>`).join("")}</div>
          <div class="s-stage">${esc(aStage.name)} · ${S.scheme.stage + 1}/${agenda.stages.length}</div>
          ${agendaChips ? `<div class="agenda-chips">${agendaChips}</div>` : ""}
        </div>
      </div>
      <div class="sideschemes">${sideHTML}</div>
      <div class="minions">${minionsHTML}</div>
    </section>
    <section class="board">
      <div class="upgrades">${upgradesHTML}</div>
      <div class="allies">${alliesHTML}</div>
    </section>
    <section class="hero-zone">
      <div class="hero-wrap">
        <div class="card hero f-${H.color} ${S.hero.exhausted ? "exhausted" : ""}" data-act="hero" data-prev="h" data-fx="hero" role="button" tabindex="0" aria-label="${esc(`${H.name}, ${S.hero.hp} of ${S.hero.maxHp} health`)}">
          <div class="c-art"><img src="${artPath(H.art)}" alt=""></div>
          <div class="c-name">${H.name}</div>
          <div class="c-stats">${statChip("&#9876;", E.heroAtk(S))}${statChip("&#10023;", E.heroThw(S))}${statChip("&#128737;", E.heroDef(S))}</div>
          ${hpbarHTML("hero-hp", Math.max(0, 100 * S.hero.hp / S.hero.maxHp), `${S.hero.hp}/${S.hero.maxHp}`)}
          ${S.hero.shield > 0 ? `<div class="shield-badge">&#128737;${S.hero.shield}</div>` : ""}
        </div>
        ${heroBtns}
      </div>
      <div class="hand">${handHTML}</div>
      <div class="side">
        <div class="pile" data-fx="pdeck" data-tip="${esc(STR.tips.deck)}">
          <img src="${artPath("cardback")}" alt="">
          <span class="count">${S.deck.length}</span>
        </div>
        <div class="pile flat" data-act="discard" data-tip="${esc(STR.tips.discard)}" role="button" tabindex="0" aria-label="${esc(STR.hud.discard)}"><span class="count">${S.discard.length}</span></div>
        <button class="btn endturn ${!E.canAct(S) || running || mode !== "idle" ? "off" : ""}" data-act="end-turn" data-tip="${esc(STR.tips.endTurn)}" ${!E.canAct(S) || running || mode !== "idle" ? "disabled" : ""}>${running ? STR.phases.villainPhase : STR.hud.endTurn}</button>
      </div>
    </section>
    <aside class="logpanel">
      <h4>${STR.hud.log}</h4>
      <div class="logs">${S.log.map((l) => `<div class="l ${l.cls}"><span>R${l.r}</span>${esc(l.msg)}</div>`).join("")}</div>
    </aside>
    <div class="inspector" id="inspector"></div>
    ${DEV ? devPanelHTML() : ""}
  </div>`;
  animateBars(prevBars);
  const logs = $(".logs");
  if (logs) logs.scrollTop = logs.scrollHeight;
  renderInspector();
}

// ---------- hp bars (ghost trail animation across re-renders) ----------
function hpbarHTML(cls, pct, label) {
  const w = pct.toFixed(1) + "%";
  return `<div class="hpbar ${cls}"><i class="ghost" style="width:${w}"></i><i class="fill" style="width:${w}"></i><b>${label}</b></div>`;
}

function captureBars() {
  const m = {};
  document.querySelectorAll("[data-fx] .hpbar i.fill").forEach((f) => {
    const host = f.closest("[data-fx]");
    if (host) m[host.dataset.fx] = f.style.width;
  });
  return m;
}

function animateBars(prev) {
  document.querySelectorAll("[data-fx] .hpbar").forEach((bar) => {
    const host = bar.closest("[data-fx]");
    const fill = bar.querySelector("i.fill");
    const ghost = bar.querySelector("i.ghost");
    if (!host || !fill) return;
    const target = fill.style.width;
    const from = prev[host.dataset.fx];
    if (from === undefined || from === target) return;
    fill.classList.add("notrans");
    if (ghost) { ghost.classList.add("notrans"); ghost.style.width = from; }
    fill.style.width = from;
    void bar.offsetWidth;
    fill.classList.remove("notrans");
    fill.style.width = target;
    if (ghost) {
      ghost.classList.remove("notrans");
      requestAnimationFrame(() => { ghost.style.width = target; });
    }
  });
}

function targetable(id) {
  return mode === "target" && targetCtx && targetCtx.valid.includes(id) ? "targetable" : "";
}

// ---------- inspector (big preview + context actions) ----------
function renderInspector() {
  const box = $("#inspector");
  if (!box || !S) return;
  if (mode !== "idle") { box.innerHTML = ""; box.classList.remove("open"); return; }
  let key = hoverPrev;
  if (!key && sel) {
    key = sel.kind === "hand" ? "p:" + E.handCard(S, sel.uid)?.c
      : sel.kind === "ally" ? "p:" + S.allies.find((a) => a.uid === sel.uid)?.c
      : sel.kind === "minion" ? "e:" + S.minions.find((m) => m.uid === sel.uid)?.c
      : sel.kind === "villain" ? "v" : sel.kind === "scheme" ? "s" : sel.kind === "hero" ? "h" : null;
  }
  if (!key || key.endsWith("undefined")) { box.innerHTML = ""; box.classList.remove("open"); return; }
  let inner = "", flavor = "", actions = "";
  if (key.startsWith("p:")) {
    const cid = key.slice(2);
    inner = playerCardHTML(cid, { cost: E.effCost(S, CARDS[cid]) });
    flavor = CARDS[cid].flavor || "";
    if (sel && sel.kind === "hand" && mode === "idle" && E.canAct(S)) {
      const c = CARDS[E.handCard(S, sel.uid)?.c || ""] || null;
      if (c && c.type !== "resource")
        actions = `<button class="btn primary" data-act="play" data-uid="${sel.uid}">${STR.actions.play} (${E.effCost(S, c)})</button>`;
      else if (c) actions = `<span class="note">${STR.actions.resourceOnly}</span>`;
    }
  } else if (key.startsWith("e:")) {
    const eid = key.slice(2);
    inner = encCardHTML(eid);
    flavor = ENCOUNTERS[eid].flavor || "";
  } else if (key === "v") {
    const st = E.stage(S);
    inner = `<div class="cardface pcard f-void"><div class="c-art"><img src="${artPath(VILLAINS[S.villainId].art)}"></div>
      <div class="c-name">${st.title}</div><div class="c-type">VILLAIN — ${STR.hud.stage} ${S.villain.stage + 1}/${VILLAINS[S.villainId].stages.length}</div>
      <div class="c-text">ATK ${E.villainAtkVal(S)} · SCHEME ${E.villainSchVal(S)} · ${STR.hud.hp} ${S.villain.hp}</div></div>`;
    flavor = "The crown remembers a king. The king remembers nothing.";
  } else if (key === "s") {
    inner = `<div class="cardface pcard f-void"><div class="c-art"><img src="${artPath(E.agendaDef(S).art)}"></div>
      <div class="c-name">${E.agendaDef(S).name}</div><div class="c-type">AGENDA · ${esc(E.agendaStage(S).name)}</div><div class="c-text">${E.agendaStage(S).text}</div></div>`;
  } else if (key === "h") {
    const H = HEROES[S.heroId];
    inner = `<div class="cardface pcard f-${H.color}"><div class="c-art"><img src="${artPath(H.art)}"></div>
      <div class="c-name">${H.name}</div><div class="c-type">${H.title.toUpperCase()}</div>
      <div class="c-text"><b>${H.ability.name}:</b> ${H.ability.text}</div>
      <div class="c-stats">${statChip("&#9876;", E.heroAtk(S))}${statChip("&#10023;", E.heroThw(S))}${statChip("&#128737;", E.heroDef(S))}${statChip("&#9829;", S.hero.hp, "hp")}</div></div>`;
    flavor = H.flavor;
  }
  box.innerHTML = `<button class="inspector-close" data-act="inspector-close" aria-label="${esc(STR.actions.cancel)}">&#10005;</button>${inner}${flavor ? `<p class="flavor">${flavor}</p>` : ""}${actions ? `<div class="insp-actions">${actions}</div>` : ""}`;
  box.classList.add("open");
}

// ---------- fx ----------
function showcase(cardId) {
  const host = $("#overlays");
  if (!host || !CARDS[cardId]) return;
  const el = document.createElement("div");
  el.className = "showcase";
  el.innerHTML = playerCardHTML(cardId);
  host.appendChild(el);
  sfx.whoosh();
  setTimeout(() => VFX.burst("spark", innerWidth / 2, innerHeight / 2, 18, 1.3), 140);
  setTimeout(() => el.remove(), 950);
}

function flyDraw(n) {
  if (NOMOTION) return;
  const from = anchorEl("pdeck")?.getBoundingClientRect();
  const hand = $(".hand")?.getBoundingClientRect();
  if (!from || !hand) return;
  for (let i = 0; i < Math.min(n, 6); i++) {
    const el = document.createElement("div");
    el.className = "flycard";
    el.innerHTML = `<img src="${artPath("cardback")}" alt="">`;
    el.style.left = from.left + "px";
    el.style.top = from.top + "px";
    document.body.appendChild(el);
    const tx = hand.left + hand.width / 2 - from.left + (Math.random() * 140 - 70);
    const ty = hand.top + 26 - from.top;
    setTimeout(() => {
      el.style.transform = `translate(${tx.toFixed(0)}px, ${ty.toFixed(0)}px) rotate(${(Math.random() * 26 - 13).toFixed(0)}deg) scale(0.72)`;
      el.style.opacity = "0";
    }, 30 + i * 90);
    setTimeout(() => el.remove(), 620 + i * 90);
  }
}

function drainFx() {
  if (!S) return;
  const q = S.fx.splice(0, S.fx.length);
  let beamN = 0;
  for (const f of q) {
    const anchor = f.at ? anchorEl(f.at) : null;
    switch (f.kind) {
      case "dmg": {
        sfx.dmg();
        floatText(anchor, "-" + f.n, "dmg" + (f.n >= 4 ? " big" : ""));
        if (anchor) { anchor.classList.add("hit"); setTimeout(() => anchor.classList.remove("hit"), 420); }
        VFX.burstAt(anchor, f.at === "hero" || String(f.at).startsWith("ally") ? "void" : "spark", 16, 1);
        if (f.at === "hero") { shake($(".game"), true); pulseVig("vig-hurt"); }
        else shake(anchor);
        break;
      }
      case "heal": sfx.heal(); floatText(anchor, "+" + f.n, "heal"); VFX.burstAt(anchor, "heal", 14); break;
      case "shield": {
        const a = anchor || anchorEl("hero");
        sfx.shield(); floatText(a, "+" + f.n, "shieldf"); VFX.burstAt(a, "shield", 16);
        break;
      }
      case "threat+": sfx.threat(); floatText(anchor, "+" + f.n, "threat"); VFX.burstAt(anchor, "void", 12); shake(anchor); break;
      case "threat-": sfx.threatDn(); floatText(anchor, "-" + f.n, "threatdn"); VFX.burstAt(anchor, "teal", 12); break;
      case "threat": sfx.threat(); break;
      case "draw": sfx.draw(); flyDraw(f.n || 1); break;
      case "play": sfx.play(); if (f.card) showcase(f.card); break;
      case "attack": sfx.attack(); break;
      case "thwart": sfx.thwart(); break;
      case "block": sfx.block(); VFX.burstAt(anchorEl("hero"), "shield", 14); break;
      case "spawn": sfx.spawn(); VFX.burstAt(anchor, "void", 18, 1.1); VFX.waveAt(anchor, "#a184ff", 90); break;
      case "kill": sfx.kill(); VFX.burstAt(anchor, "soul", 26, 1.2); VFX.waveAt(anchor, "#a184ff", 110); break;
      case "incoming": sfx.incoming(); break;
      case "tear": sfx.dmg(); break;
      case "reveal": VFX.wave(innerWidth / 2, innerHeight / 2 - 40, "#a184ff", 150); break;
      case "banner":
        banner(esc(f.text), f.tone === "stage" ? "stage" : "bad");
        sfx.stage();
        shake($(".game"), true);
        VFX.wave(innerWidth / 2, innerHeight / 2, "#ff8a3d", 260);
        VFX.burst("spark", innerWidth / 2, innerHeight / 2, 40, 2.2);
        break;
      case "end":
        if (f.win) { sfx.win(); VFX.rain("ember", 5200); }
        else { sfx.lose(); VFX.rain("ash", 5200); }
        break;
      case "beam": {
        const fromEl = anchorEl(f.from);
        if (fromEl) { fromEl.classList.add("lunge"); setTimeout(() => fromEl.classList.remove("lunge"), 260); }
        VFX.beamEl(fromEl, anchorEl(f.to), f.tone, beamN++ * 0.09);
        break;
      }
      case "shatter": sfx.shatter(); VFX.shatterEl(anchorEl("villain")); shake($(".game"), true); break;
      case "rally": sfx.rally(); for (const a of S.allies) VFX.burstAt(anchorEl("ally:" + a.uid), "heal", 10); break;
      case "lowhp": sfx.heartbeat(); pulseVig("vig-hurt"); break;
      case "nova":
        sfx.nova();
        VFX.burstAt(anchorEl("villain"), f.tone === "teal" ? "teal" : "spark", 30, 1.6);
        VFX.waveAt(anchorEl("villain"), "#ff8a3d", 180);
        for (const m of S.minions) VFX.burstAt(anchorEl("minion:" + m.uid), "spark", 16, 1.1);
        break;
      case "doomPulse": pulseVig("vig-doom"); VFX.burstAt(anchorEl("scheme"), "void", 14); break;
      case "agenda":
        sfx.stage();
        shake($(".game"), true);
        VFX.waveAt(anchorEl("scheme"), "#a184ff", 220);
        VFX.burstAt(anchorEl("scheme"), "void", 34, 1.8);
        // during the villain phase runVillain shows the blocking modal itself
        if (S.phase !== "villain") agendaModal(f.stage).then(() => {});
        break;
      case "crisisBlock":
        sfx.deny();
        floatText(anchorEl("scheme"), "\u{1F512} CRISIS", "threat");
        shake(anchorEl("scheme"));
        break;
      case "boostReveal":
        sfx.reveal();
        revealFlash(f.card);
        if (f.n) floatText(anchorEl("villain"), `+${f.n} ATK`, "dmg");
        break;
      case "stunfx": sfx.shield(); floatText(anchorEl("villain"), "STUNNED", "shieldf"); VFX.burstAt(anchorEl("villain"), "teal", 18); break;
      case "burnfx": sfx.attack(); floatText(anchorEl("villain"), "BURN", "dmg"); VFX.burstAt(anchorEl("villain"), "spark", 14); break;
      case "sideClear": sfx.rally(); VFX.wave(innerWidth / 2, innerHeight / 3, "#3fc9b6", 170); VFX.burst("teal", innerWidth / 2, innerHeight / 3, 24, 1.4); break;
      case "burst":
        sfx.nova();
        shake($(".game"), true);
        VFX.waveAt(anchor || anchorEl("scheme"), "#c9563f", 200);
        VFX.burstAt(anchor || anchorEl("scheme"), "spark", 30, 1.6);
        break;
      case "loom": {
        const v = anchorEl("villain");
        if (v) { v.classList.add("looming"); setTimeout(() => v.classList.remove("looming"), 950); }
        break;
      }
      case "turn": sfx.turn(); banner(STR.phases.yourTurn, "turn"); break;
    }
  }
}

function revealFlash(eid) {
  if (!eid || !ENCOUNTERS[eid]) return;
  const host = $("#overlays");
  const el = document.createElement("div");
  el.className = "reveal-flash";
  el.innerHTML = encCardHTML(eid);
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), 1000);
  setTimeout(() => el.remove(), 1450);
}

// ---------- dev panel ----------
function devPanelHTML() {
  return `<div class="devpanel">
    <b>DEV</b> seed:${S.seed.slice(0, 6)} r${S.round} ${S.phase}
    <button data-dev="v5">V-5</button><button data-dev="h3">H-3</button>
    <button data-dev="t3">T+3</button><button data-dev="d3">Draw3</button>
    <button data-dev="win">Win</button><button data-dev="lose">Lose</button>
  </div>`;
}
document.body.addEventListener("click", (e) => {
  const b = e.target.closest("[data-dev]");
  if (!b || !S) return;
  const k = b.dataset.dev;
  if (k === "v5") E.dev.dmgVillain(S, 5);
  if (k === "h3") E.dev.dmgHero(S, 3);
  if (k === "t3") E.addThreat(S, 3);
  if (k === "d3") E.dev.draw(S, 3);
  if (k === "win") { E.dev.dmgVillain(S, 99); if (!S.over) { E.dev.dmgVillain(S, 99); if (!S.over) E.dev.dmgVillain(S, 99); } }
  if (k === "lose") E.dev.dmgHero(S, 99);
  commit();
});
if (DEV) window.AM = { get S() { return S; }, E, render: () => render(), commit: () => commit() };

// ============================================================
// TWIN VIGILS — online co-op layer (active only when the page
// sets window.__COOP__; the co-op deploy ships its own logic.js)
// ============================================================
const COOP = {
  on: !!window.__COOP__,
  ws: null, room: null, playerId: null,
  state: null, myHero: null,
  started: false, finished: false, finalShown: false,
  consumedAid: 0, lastReport: 0, gen: 0,
};

function coopBoot() {
  document.body.classList.add("coop");
  const params = new URLSearchParams(location.search);
  let room = params.get("room");
  if (!room) {
    room = Math.random().toString(36).slice(2, 8);
    params.set("room", room);
    history.replaceState(null, "", location.pathname + "?" + params);
  }
  COOP.room = room;
  let pid = sessionStorage.getItem("mp-player-id");
  if (!pid) {
    pid = "p-" + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem("mp-player-id", pid);
  }
  COOP.playerId = pid;
  VFX.init && renderCoopLobby(STR.coop.connecting);
  coopConnect();
}

function coopSend(obj) {
  if (COOP.ws && COOP.ws.readyState === 1) COOP.ws.send(JSON.stringify(obj));
}

function coopConnect() {
  const base = location.pathname.replace(/\/+$/, "");
  const wsUrl = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + base + "/ws/" + COOP.room;
  COOP.ws = new WebSocket(wsUrl);
  COOP.ws.onopen = () => coopSend({ type: "join", playerId: COOP.playerId });
  COOP.ws.onclose = () => { toast(STR.coop.disconnected); setTimeout(coopConnect, 1500); };
  COOP.ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    if (msg.type === "error") { toast(msg.error); return; }
    if (msg.type === "state") coopOnState(msg);
  };
}

function coopVillain() {
  const p = new URLSearchParams(location.search);
  return VILLAINS[p.get("v")] ? p.get("v") : "morvane";
}

function coopOnState(msg) {
  COOP.state = msg;
  if (msg.status === "waiting") { renderCoopLobby(); return; }
  const v = msg.view || {};
  if (msg.status === "playing") {
    // a fresh setup after reset: reports wiped -> next generation
    if (COOP.finished && v.reports && Object.keys(v.reports).length === 0) {
      COOP.gen++; COOP.started = false; COOP.finished = false; COOP.finalShown = false; COOP.consumedAid = 0;
      $(".modal.coop-final")?.remove();
    }
    if (!COOP.started) {
      if (COOP.myHero) coopStartGame();
      else renderCoopLobby();
      return;
    }
    const aid = (v.aid || {})[COOP.playerId] || 0;
    if (aid > COOP.consumedAid && S && !S.over) {
      const n = aid - COOP.consumedAid;
      COOP.consumedAid = aid;
      S.hero.shield += 2 * n;
      E.dev.draw(S, n);
      toast(STR.coop.aidReceived);
      sfx.rally();
      VFX.burstAt(anchorEl("hero"), "heal", 22);
      save(); render();
    }
    renderPartnerPanel();
  }
  if (msg.status === "over" && msg.result && !COOP.finalShown) {
    COOP.finalShown = true;
    COOP.finished = true;
    coopFinalOverlay(msg.result);
  }
}

function coopMaybeStart() {
  if (COOP.on && COOP.myHero && COOP.state && COOP.state.status === "playing" && !COOP.started) coopStartGame();
}

function coopStartGame() {
  COOP.started = true;
  const p = new URLSearchParams(location.search);
  const diff = p.get("d") === "nightmare" ? "nightmare" : "normal";
  S = E.newGame(COOP.myHero, coopVillain(), diff, "twin-" + COOP.room + "-g" + COOP.gen, {});
  startDrone(); startMusic(); setMusicStage(0); VFX.setIntensity(1);
  resetModes();
  document.body.className = "in-game coop";
  render();
  drainFx();
  showMulligan();
  coopReport(true);
}

function coopReport(force) {
  if (!COOP.on || !S || !COOP.started) return;
  const now = Date.now();
  if (!force && now - COOP.lastReport < 600) return;
  COOP.lastReport = now;
  coopSend({
    type: "action",
    action: {
      kind: "report",
      snap: {
        heroId: S.heroId, hp: S.hero.hp, maxHp: S.hero.maxHp, round: S.round,
        threat: S.scheme.threat, threshold: E.schemeThreshold(S), schemeStage: S.scheme.stage,
        stageIdx: S.villain.stage, stageTitle: E.stage(S).title,
        over: !!S.over, win: !!(S.over && S.over.win),
      },
    },
  });
}

function renderCoopLobby(note) {
  if (document.body.classList.contains("in-game")) return;
  const v = VILLAINS[coopVillain()];
  const waiting = !COOP.state || COOP.state.status === "waiting";
  const seated = COOP.state ? (COOP.state.seats || []).includes(COOP.playerId) : true;
  app().innerHTML = `
  <div class="menu" style="background-image:linear-gradient(rgba(8,10,14,.55),rgba(8,10,14,.92)),url('${artPath("thumbnail")}')">
    <h1 class="title small">${STR.coop.title}</h1>
    <p class="subtitle">${STR.coop.subtitle}</p>
    <div class="vpick picked" style="cursor:default">
      <img src="${artPath(v.art)}" alt="">
      <div class="vp-body">
        <div class="pick-name">${v.name}</div>
        <div class="pick-title">${v.epithet}</div>
        <div class="pick-ab">${tpl(STR.coop.sameStorm, { v: v.name })}</div>
      </div>
    </div>
    <div class="vs-label">${STR.coop.pickHero}</div>
    <div class="hero-pick">
      ${Object.values(HEROES).map((h) => `
        <div class="pick ${COOP.myHero === h.id ? "picked" : ""} f-${h.color}" data-act="coop-hero" data-id="${h.id}">
          <img src="${artPath(h.art)}" alt="">
          <div class="pick-name">${h.name}</div>
          <div class="pick-title">${h.title}</div>
        </div>`).join("")}
    </div>
    <div class="coop-status">${!seated ? STR.coop.spectating : note || (waiting ? STR.coop.waiting : COOP.myHero ? STR.coop.partnerJoined : "")}</div>
    ${waiting ? `<input class="coop-link" readonly value="${location.href}" onclick="this.select()">` : ""}
  </div>`;
}

function renderPartnerPanel() {
  let el = document.getElementById("partner-panel");
  if (!COOP.on || !COOP.state || !document.body.classList.contains("in-game")) { el?.remove(); return; }
  const v = COOP.state.view || {};
  const partnerId = (COOP.state.seats || []).find((p) => p !== COOP.playerId);
  const r = partnerId ? (v.reports || {})[partnerId] : null;
  const spent = ((v.beacons || {})[COOP.playerId] || 0) >= 1;
  if (!el) {
    el = document.createElement("div");
    el.id = "partner-panel";
    document.body.appendChild(el);
  }
  const H = r && HEROES[r.heroId] ? HEROES[r.heroId] : null;
  el.innerHTML = `
    <div class="pp-title">${STR.coop.partner}${H ? " · " + H.name : ""}</div>
    ${r ? `
      <div class="pp-bar"><i style="width:${Math.max(0, (100 * r.hp) / Math.max(1, r.maxHp)).toFixed(0)}%"></i><b>${r.hp}/${r.maxHp}</b></div>
      <div class="pp-row">R${r.round} · ${esc(r.stageTitle || "")}</div>
      <div class="pp-row">Doom ${r.threat}/${r.threshold}${r.over ? (r.win ? " · VIGIL HELD" : " · FALLEN") : ""}</div>
    ` : `<div class="pp-row">${STR.coop.waiting.split(" — ")[0]}</div>`}
    <button class="btn small ${spent || !r || r.over ? "off" : ""}" data-act="coop-beacon">&#128293; ${spent ? STR.coop.beaconSpent : STR.coop.beacon}</button>
  `;
}

function coopLocalEnd() {
  coopReport(true);
  if (COOP.finalShown) return;
  const el = document.createElement("div");
  el.className = "modal end coop-wait";
  el.innerHTML = `
    <div class="modal-box end-box ${S.over.win ? "won" : "lost"}">
      <h2>${S.over.win ? STR.end.victory : STR.end.defeat}</h2>
      <p class="end-reason">${S.over.win ? STR.coop.held : STR.coop.youFell}</p>
      <div class="end-stats">
        <div><b>${S.stats.rounds}</b><span>${STR.end.rounds}</span></div>
        <div><b>${S.stats.dmgDealt}</b><span>${STR.end.dmg}</span></div>
      </div>
    </div>`;
  $("#overlays").appendChild(el);
  if (S.over.win) sfx.win(); else sfx.lose();
}

function coopFinalOverlay(result) {
  $(".modal.coop-wait")?.remove();
  $(".modal.end")?.remove();
  const won = !!result.held;
  const el = document.createElement("div");
  el.className = "modal coop-final";
  el.innerHTML = `
    <div class="modal-box end-box ${won ? "won" : "lost"}">
      <h2>${won ? STR.coop.finalWinTitle : STR.coop.finalLoseTitle}</h2>
      <p class="end-reason">${won ? STR.coop.finalWinText : STR.coop.finalLoseText}</p>
      <button class="btn primary" data-act="coop-reset">${STR.coop.again}</button>
    </div>`;
  $("#overlays").appendChild(el);
  if (won) { sfx.win(); VFX.rain("ember", 6000); }
  else { sfx.lose(); VFX.rain("ash", 5000); }
}
