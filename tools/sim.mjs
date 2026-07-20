// ============================================================
// ASHENMOOR — headless balance / smoke-test simulator (v1.2)
// Run: node tools/sim.mjs           (150 games per combo)
//      GAMES=n node tools/sim.mjs   (override games per combo)
//      BASE=1 node tools/sim.mjs   (strict mandated policy, no refinements)
//      TRACE="hero,villain,seed" node tools/sim.mjs  (print one game's log)
// ============================================================

// NOTE: an earlier v1.2 build of engine.js crashed in healVillain() with
// "ReferenceError: VILLAIN is not defined" (stale reference to the removed
// `VILLAIN` export) whenever feast_of_shadows healed a damaged villain.
// That line now reads `villainDef(S).name` and the crash is gone; if it
// ever regresses, this sim's per-game try/catch will surface it in the
// `crashes` output.

import * as E from "../js/engine.js";
import { HEROES, CARDS, ENCOUNTERS, VILLAINS } from "../js/cards.js";
import * as CAMP from "../js/campaign.js";
import { next, seedFrom } from "../js/rng.js";

const GAMES = Number(process.env.GAMES || 150);
const ROUND_CAP = 200;
const DIFFICULTIES = (process.env.DIFFICULTIES || process.env.DIFFICULTY || "normal")
  .split(",")
  .map((x) => x.trim())
  .filter((x) => ["normal", "nightmare"].includes(x));
const CAMPAIGN_MODE = process.env.CAMPAIGN === "1";
// SMART=policy refinements on top of the mandated baseline (BASE=1 to disable):
//  - hold one ready ally as a blocker on ATTACK-intent rounds
//  - hero basic action: also disrupt when THW > ATK and there is threat to remove
//  - damage events avoid overkilling minions (chip the villain instead)
//  - dmg1 ability finishes a 1-hp minion when one exists, else villain
const SMART = !process.env.BASE;
// how far below the scheme threshold the policy starts disrupting
const HERO_MARGIN = Number(process.env.HERO_MARGIN || 2); // hero basic action
const ALLY_MARGIN = Number(process.env.ALLY_MARGIN || 3); // ally actions
const EVENT_MARGIN = Number(process.env.EVENT_MARGIN || 3); // thwart events

// ---------- policy helpers ----------
function lowestHpMinion(S) {
  return S.minions.reduce((b, m) => (!b || m.hp < b.hp ? m : b), null);
}
function strongestMinion(S) {
  return S.minions.reduce(
    (b, m) =>
      !b ||
      ENCOUNTERS[m.c].atk > ENCOUNTERS[b.c].atk ||
      (ENCOUNTERS[m.c].atk === ENCOUNTERS[b.c].atk && m.hp > b.hp)
        ? m
        : b,
    null
  );
}
// kill minions first, else the villain
function pickEnemyTarget(S) {
  const m = lowestHpMinion(S);
  return m ? m.uid : "villain";
}

// where to aim disrupts: a CRISIS side scheme shields the agenda, so it
// must be severed first (lowest threat clears fastest); else the agenda
function thwartTarget(S) {
  if (E.hasCrisis(S)) {
    const crisis = S.sideSchemes.filter((ss) => ENCOUNTERS[ss.c].crisis);
    return crisis.reduce((b, ss) => (ss.threat < b.threat ? ss : b)).uid;
  }
  return "scheme";
}

// target for a damage event of n dmg: damage events race the villain;
// they only divert to a minion when they can kill something dangerous
// (atk >= 2). Chaff minions are left to basic attacks / abilities / allies.
function eventDmgTarget(S, n) {
  if (!SMART) return pickEnemyTarget(S);
  // heroes with a weak basic attack (sera/odran) also use events on chaff,
  // since they have no other efficient way to clear it
  const minAtk = E.heroAtk(S) >= 2 ? 2 : 1;
  const kills = S.minions.filter(
    (m) => m.hp <= n && ENCOUNTERS[m.c].atk >= minAtk
  );
  // among killable dangerous minions, prefer the one using most of the damage
  if (kills.length) return kills.reduce((b, m) => (m.hp > b.hp ? m : b)).uid;
  return "villain";
}

// score a hand card for the greedy play loop; null = don't play it
function evalCard(S, h) {
  const card = CARDS[h.c];
  if (card.type === "resource") return null;
  const th = E.schemeThreshold(S);
  const threat = S.scheme.threat;
  const villainLow = S.villain.hp <= 6;
  const nMin = S.minions.length;

  if (card.type === "ally") {
    if (S.allies.length >= 3) return null;
    const target =
      card.enter && card.enter.target ? pickEnemyTarget(S) : null;
    if (card.enter && card.enter.target && !target) return null;
    return { score: 70, target };
  }
  if (card.type === "upgrade") return { score: 60, target: null };

  // events
  const ef = card.effect || {};
  if (ef.readyAllies) return null; // handled in the post-ally rally pass
  if (ef.readyHero) return null; // handled only after the hero actually exhausts
  if (ef.selfDmg && S.hero.hp <= ef.selfDmg + 1) return null; // don't suicide

  let score = 0;
  let target = null;
  if (ef.banish) {
    if (nMin === 0) return null;
    target = strongestMinion(S).uid;
    score = 88;
  } else if (ef.dmg) {
    target = eventDmgTarget(S, ef.dmg);
    score = nMin > 0 || villainLow ? 90 : 75;
  } else if (ef.dmgAll) {
    // AoE with no minions is terrible card economy unless it finishes a stage
    if (SMART && nMin === 0 && S.villain.hp > ef.dmgAll) return null;
    score = nMin >= 2 ? 92 : nMin === 1 || villainLow ? 85 : 70;
  }
  if (ef.thwart && (threat >= th - EVENT_MARGIN || E.hasCrisis(S))) {
    score = Math.max(score, 100);
    if (S.sideSchemes.length) target = thwartTarget(S);
  }
  if (ef.heal && S.hero.hp <= S.hero.maxHp - 3)
    score = Math.max(score, ef.heal >= 4 ? 80 : 70);
  if (ef.draw && !ef.dmg && !ef.thwart && !ef.shield)
    score = Math.max(score, 50);
  if (ef.shield) {
    if (S.intent === "attack") score = Math.max(score, 62);
    if (ef.draw) score = Math.max(score, 55); // shield_wall semi-cantrip
  }
  if (ef.seal && S.intent === "attack") score = Math.max(score, 58);
  if (score < 40) return null;
  return { score, target };
}

function greedyPlays(S) {
  const skipped = new Set();
  for (let guard = 0; guard < 30 && !S.over; guard++) {
    let best = null;
    for (const h of S.hand) {
      if (skipped.has(h.uid)) continue;
      const ev = evalCard(S, h);
      if (!ev) continue;
      if (!best || ev.score > best.ev.score) best = { h, ev };
    }
    if (!best) break;
    const pay = E.autoPay(S, best.h.uid);
    if (pay == null) {
      skipped.add(best.h.uid);
      continue;
    }
    const err = E.playCard(S, best.h.uid, pay, best.ev.target);
    if (err !== null) skipped.add(best.h.uid); // respect validation, skip card
  }
}

// on ATTACK-intent rounds, is staying ready to defend worth more than the
// hero's basic action? (odran: DEF 3 vs ATK 1 -> yes; kaelen/sera -> no)
function heroShouldHold(S) {
  if (!SMART || S.intent !== "attack" || S.villainSealed) return false;
  // never hold when a disrupt is needed to stave off the final agenda stage
  const lastStage = E.agendaDef(S).stages.length - 1;
  if (S.scheme.stage === lastStage && S.scheme.threat >= E.schemeThreshold(S) - 2)
    return false;
  const prevented = Math.min(E.villainAtkVal(S), E.heroDef(S));
  const actValue = Math.max(E.heroAtk(S), Math.min(E.heroThw(S), S.scheme.threat));
  return prevented > actValue;
}

function allyActions(S) {
  const th = E.schemeThreshold(S);
  // on ATTACK-intent rounds keep the lowest-hp ready ally back as a blocker
  // (unless the hero itself is staying ready to defend)
  let blocker = null;
  if (SMART && S.intent === "attack" && !heroShouldHold(S) && S.allies.length) {
    const ready = S.allies.filter((a) => !a.exhausted);
    if (ready.length)
      blocker = ready.reduce((b, a) => (a.hp < b.hp ? a : b)).uid;
  }
  for (const a of S.allies.slice()) {
    if (S.over) return;
    if (a.exhausted || !S.allies.includes(a)) continue;
    if (a.uid === blocker) continue;
    const card = CARDS[a.c];
    if ((card.thw || 0) > 0 && (S.scheme.threat >= th - ALLY_MARGIN || E.hasCrisis(S))) {
      E.allyAct(S, a.uid, "thwart", thwartTarget(S));
    } else {
      E.allyAct(S, a.uid, "attack", pickEnemyTarget(S));
    }
  }
}

// after allies exhaust, rally_the_watch becomes worth playing
function tryRally(S) {
  const h = S.hand.find(
    (x) => CARDS[x.c].effect && CARDS[x.c].effect.readyAllies
  );
  if (!h) return false;
  if (S.allies.filter((a) => a.exhausted).length < 2) return false;
  const pay = E.autoPay(S, h.uid);
  if (pay == null) return false;
  return E.playCard(S, h.uid, pay, null) === null;
}

function useHeroBasic(S) {
  if (S.hero.exhausted || heroShouldHold(S)) return false;
  const th = E.schemeThreshold(S);
  const nearCap = S.scheme.threat >= th - HERO_MARGIN;
  const controlWindow = SMART && E.heroThw(S) > E.heroAtk(S) && S.scheme.threat >= Math.max(E.heroThw(S), th - 5);
  if (nearCap || controlWindow || (SMART && E.hasCrisis(S))) E.basicThwart(S, thwartTarget(S));
  else E.basicAttack(S, pickEnemyTarget(S));
  return true;
}

function tryReadyHero(S) {
  if (!S.hero.exhausted) return false;
  const options = S.hand
    .filter((h) => CARDS[h.c].effect?.readyHero)
    .sort((a, b) => (CARDS[a.c].cost || 0) - (CARDS[b.c].cost || 0));
  for (const h of options) {
    const pay = E.autoPay(S, h.uid);
    if (pay == null) continue;
    if (E.playCard(S, h.uid, pay, null) === null) return true;
  }
  return false;
}

function playerTurn(S) {
  greedyPlays(S);
  if (S.over) return;

  // hero ability every round
  const kind = HEROES[S.heroId].ability.kind;
  if (kind === "dmg1") {
    const oneHp = SMART ? S.minions.find((m) => m.hp === 1) : null;
    E.heroAbility(S, oneHp ? oneHp.uid : "villain");
  } else E.heroAbility(S);
  if (S.over) return;

  allyActions(S);
  if (S.over) return;
  if (tryRally(S) && !S.over) allyActions(S); // second wave after rally
  if (S.over) return;

  // basic action: disrupt when doom is close to the threshold, else attack.
  // Ready effects are deliberately played after this action so they create a
  // real second activation instead of being wasted by the policy.
  useHeroBasic(S);
  let readyGuard = 0;
  while (!S.over && readyGuard++ < 3 && tryReadyHero(S)) useHeroBasic(S);
  if (S.over) return;
  E.endTurn(S);
}

function defend(S) {
  const opt = E.defenseOptions(S);
  if (!opt) return;
  const d = opt.dmg;
  const ready = opt.allies
    .map((o) => ({ ...o, hp: S.allies.find((a) => a.uid === o.uid).hp }))
    .sort((x, y) => x.hp - y.hp);
  const heroWouldTake = opt.heroCanDefend ? opt.heroDmgIfDefend : d;
  // block with the lowest-hp ready ally when the ally is dying anyway
  // (1 hp = next consequential hit kills it) or the hero would take >=3;
  // never trade an ally for a trivial 1-damage hit
  const chumpOk =
    ready.length && ((ready[0].hp === 1 && d >= 2) || heroWouldTake >= 3);
  if (chumpOk) {
    // prefer the cheapest ally that SURVIVES the hit; else chump the lowest
    const survivors = ready.filter((o) => !o.dies);
    const blocker = SMART && survivors.length ? survivors[0] : ready[0];
    E.applyDefense(S, { kind: "ally", uid: blocker.uid });
  } else if (opt.heroCanDefend && E.heroDef(S) >= 2) {
    E.applyDefense(S, { kind: "hero" });
  } else {
    E.applyDefense(S, { kind: "take" });
  }
}

function villainPhase(S) {
  let guard = 0;
  while (S.phase === "villain" && !S.over && guard++ < 300) {
    if (S.vp.pending) defend(S);
    else if (S.vp.revealed) E.resolveReveal(S);
    else if (S.vp.agenda != null) E.ackAgenda(S);
    else E.stepVillain(S);
  }
}

// ---------- one full game ----------
export function playGame(heroId, villainId, seed, trace = false, opts = {}) {
  const difficulty = opts.difficulty || "normal";
  const S = E.newGame(heroId, villainId, difficulty, seed, opts);
  // mulligan: shuffle back opening cards the policy has no use for
  // (evaluates to null at game start), keeping resources as payment fuel
  if (SMART) {
    const toss = S.hand
      .filter((h) => CARDS[h.c].type !== "resource" && !evalCard(S, h))
      .map((h) => h.uid);
    if (toss.length) E.doMulligan(S, toss);
  }
  let logAt = 0;
  const flush = () => {
    if (!trace) return;
    while (logAt < S.log.length) {
      const e = S.log[logAt++];
      console.log(`  [r${e.r}] ${e.msg}`);
    }
  };
  let guard = 0;
  while (!S.over && guard++ < ROUND_CAP) {
    playerTurn(S);
    flush();
    if (S.over) break;
    villainPhase(S);
    flush();
    S.fx.length = 0; // drain fx queue (no UI attached)
  }
  if (trace)
    console.log(
      `  == over: ${JSON.stringify(S.over)} round ${S.round} villain stage ${S.villain.stage} hp ${S.villain.hp} hero hp ${S.hero.hp} threat ${S.scheme.threat}/${E.schemeThreshold(S)} schemeStage ${S.scheme.stage}`
    );
  if (!S.over) return { stalled: true, rounds: S.round, state: S };
  return { win: S.over.win, reason: S.over.reason, rounds: S.round, state: S };
}

function draftScore(heroId, id) {
  const card = CARDS[id];
  if (card.type === "resource") return 120 + (card.res || 1) * 10;
  if (id === "cinder_of_the_first_flame") return 112;
  if (id === "wardens_oath") return heroId === "odran" ? 86 : 108;
  let score = 50 - (card.cost || 0) * 3;
  const ef = card.effect || {};
  if (ef.dmg) score += ef.dmg * 12;
  if (ef.dmgAll) score += ef.dmgAll * 15;
  if (ef.thwart) score += ef.thwart * 10;
  if (ef.heal) score += ef.heal * 5;
  if (ef.draw) score += ef.draw * 8;
  if (ef.stun || ef.seal) score += 18;
  if (ef.burn) score += ef.burn * 8;
  if (card.type === "ally") score += (card.atk || 0) * 8 + (card.thw || 0) * 7 + (card.hp || 0) * 3;
  if (card.type === "upgrade") score += 20;
  return score;
}

function trimCandidate(c) {
  if (!CAMP.canRemove(c)) return null;
  const counts = {};
  for (const id of c.deck) counts[id] = (counts[id] || 0) + 1;
  return c.deck
    .filter((id) => CARDS[id].type !== "resource")
    .map((id) => ({ id, score: draftScore(c.heroId, id) - Math.max(0, counts[id] - 2) * 8 }))
    .sort((a, b) => a.score - b.score)[0]?.id || null;
}

export function playCampaign(heroId, difficulty, seed) {
  const c = CAMP.start(heroId, difficulty);
  let rng = seedFrom(seed);
  const random = () => {
    const [value, state] = next(rng);
    rng = state;
    return value;
  };
  const attempts = [];
  let guard = 0;
  while (!CAMP.isComplete(c) && !CAMP.isDoomed(c) && guard++ < 24) {
    const villainId = CAMP.ACTS[c.act];
    const result = playGame(heroId, villainId, `${seed}-act${c.act}-try${guard}`, false, {
      difficulty,
      isCampaign: true,
      deck: c.deck,
      maxHpMod: -c.scars,
      startDoom: c.extraDoom,
      startShield: c.resolve || 0,
      openingHandBonus: c.resolve || 0,
    });
    attempts.push({
      act: c.act,
      villain: villainId,
      win: !!result.win,
      reason: result.reason || (result.stalled ? "stalled" : null),
      rounds: result.rounds,
      hp: result.state.hero.hp,
    });
    if (result.stalled) break;
    if (result.win) {
      CAMP.applyWin(c, result.state);
      if (!CAMP.isComplete(c)) {
        const options = CAMP.draftOptions(c, random);
        const pick = options.sort((a, b) => draftScore(heroId, b) - draftScore(heroId, a))[0];
        if (pick) CAMP.addCard(c, pick);
        const trim = trimCandidate(c);
        if (trim) CAMP.removeCard(c, trim);
      }
    } else {
      CAMP.applyLoss(c, result.state);
    }
  }
  return {
    win: CAMP.isComplete(c),
    doomed: CAMP.isDoomed(c),
    stalled: guard >= 24,
    act: c.act,
    scars: c.scars,
    deckSize: c.deck.length,
    attempts,
  };
}

// ---------- matrix run ----------
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain && process.env.TRACE) {
  const [h = "kaelen", v = "morvane", s = "sim-0", d = "normal"] = process.env.TRACE.split(",");
  console.log(`TRACE ${h} vs ${v} seed ${s}`);
  playGame(h, v, s, true, { difficulty: d });
  process.exit(0);
}
if (isMain) {
  const heroes = ["kaelen", "sera", "odran"];
  const villains = ["morvane", "vexahl", "nul"];
  const results = [];
  const crashes = [];

  if (CAMPAIGN_MODE) {
    for (const difficulty of DIFFICULTIES) {
      for (const hero of heroes) {
        let wins = 0, doomed = 0, stalls = 0, actSum = 0, attemptSum = 0, scarSum = 0;
        for (let i = 0; i < GAMES; i++) {
          try {
            const r = playCampaign(hero, difficulty, `campaign-${i}`);
            if (r.win) wins++;
            if (r.doomed) doomed++;
            if (r.stalled) stalls++;
            actSum += r.act;
            attemptSum += r.attempts.length;
            scarSum += r.scars;
          } catch (e) {
            crashes.push({ hero, difficulty, seed: `campaign-${i}`, error: String(e) });
          }
        }
        const played = GAMES - crashes.filter((x) => x.hero === hero && x.difficulty === difficulty).length;
        results.push({
          mode: "campaign", hero, difficulty, games: played, wins,
          winRate: played ? +(wins / played).toFixed(3) : 0,
          doomed, stalls,
          avgActsCleared: played ? +(actSum / played).toFixed(2) : 0,
          avgAttempts: played ? +(attemptSum / played).toFixed(2) : 0,
          avgScars: played ? +(scarSum / played).toFixed(2) : 0,
        });
      }
    }
  } else for (const difficulty of DIFFICULTIES) {
    for (const hero of heroes) {
      for (const villain of villains) {
      let wins = 0,
        loseHp = 0,
        loseScheme = 0,
        stalls = 0,
        roundSum = 0,
        hpSum = 0,
        stageSum = 0,
        played = 0;
      for (let i = 0; i < GAMES; i++) {
        const seed = "sim-" + i;
        try {
          const r = playGame(hero, villain, seed, false, { difficulty });
          played++;
          roundSum += r.rounds;
          hpSum += r.state.hero.hp;
          stageSum += r.state.villain.stage;
          if (r.stalled) stalls++;
          else if (r.win) wins++;
          else if (r.reason === "hp") loseHp++;
          else loseScheme++;
        } catch (e) {
          crashes.push({ hero, villain, difficulty, seed, error: String(e) });
        }
      }
      results.push({
        mode: "matchup", hero, villain, difficulty,
        games: played,
        wins,
        winRate: played ? +(wins / played).toFixed(3) : 0,
        avgRounds: played ? +(roundSum / played).toFixed(1) : 0,
        avgEndHeroHp: played ? +(hpSum / played).toFixed(1) : 0,
        avgVillainStageReached: played ? +(stageSum / played).toFixed(2) : 0,
        loseByHp: loseHp,
        loseByScheme: loseScheme,
        stalls,
      });
      }
    }
  }

  console.log(JSON.stringify({
    meta: { gamesPerRow: GAMES, smartPolicy: SMART, difficulties: DIFFICULTIES, campaign: CAMPAIGN_MODE },
    results,
    crashes: crashes.slice(0, 5),
    crashCount: crashes.length,
  }, null, 2));
}
