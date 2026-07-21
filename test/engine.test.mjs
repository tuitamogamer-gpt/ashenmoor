import test from "node:test";
import assert from "node:assert/strict";

import * as E from "../js/engine.js";
import { CARDS, HEROES } from "../js/cards.js";

const HERO_IDS = ["kaelen", "sera", "odran"];
const VILLAIN_IDS = ["morvane", "vexahl", "nul"];

function finishVillainPhase(S) {
  let guard = 0;
  while (S.phase === "villain" && !S.over && guard++ < 400) {
    if (S.vp.pending) E.applyDefense(S, { kind: "take" });
    else if (S.vp.revealed) E.resolveReveal(S);
    else if (S.vp.agenda != null) E.ackAgenda(S);
    else E.stepVillain(S);
  }
  assert.ok(guard < 400, "villain phase should always make progress");
}

test("same seed creates the same opening state", () => {
  const a = E.newGame("kaelen", "morvane", "normal", "repeatable");
  const b = E.newGame("kaelen", "morvane", "normal", "repeatable");
  assert.deepEqual(a.hand, b.hand);
  assert.deepEqual(a.deck, b.deck);
  assert.deepEqual(a.enc.deck, b.enc.deck);
  assert.equal(a.rng, b.rng);
});

test("Nightmare applies its documented combat and agenda pressure", () => {
  const normal = E.newGame("sera", "nul", "normal", "difficulty-shape");
  const nightmare = E.newGame("sera", "nul", "nightmare", "difficulty-shape");
  assert.equal(nightmare.villain.hp, normal.villain.hp + 1);
  assert.equal(E.villainAtkVal(nightmare), E.villainAtkVal(normal) + 1);
  assert.equal(E.schemeThreshold(nightmare), E.schemeThreshold(normal) - 1);
});

test("doom forecast combines spread and a telegraphed scheme before hidden encounters", () => {
  const S = E.newGame("kaelen", "morvane", "normal", "doom-forecast");
  S.intent = "scheme";
  S.scheme.threat = E.schemeThreshold(S) - 2;

  const forecast = E.doomForecast(S);
  assert.deepEqual(forecast, {
    active: true,
    spread: 1,
    scheme: E.villainSchVal(S),
    effects: 0,
    total: 1 + E.villainSchVal(S),
    remaining: 2,
    advances: true,
    lethal: false,
  });

  assert.equal(E.endTurn(S), null);
  assert.equal(E.doomForecast(S).active, false, "forecast hides once the villain phase starts");
  E.stepVillain(S); // known Doom Spread
  E.stepVillain(S); // telegraphed SCHEME activation
  assert.equal(S.scheme.stage, 1);
  assert.equal(S.scheme.threat, 0);
});

test("only a printed failed-heal fallback adds doom", () => {
  const agenda = E.newGame("kaelen", "morvane", "normal", "agenda-heal-doom");
  agenda.scheme.threat = E.schemeThreshold(agenda) - 1;
  E.addThreat(agenda, 1);
  assert.equal(agenda.scheme.stage, 1);
  assert.equal(agenda.scheme.threat, 0, "Morvane's agenda heal has no Doom fallback");

  const feast = E.newGame("kaelen", "morvane", "normal", "feast-heal-doom");
  feast.vp.revealed = "feast_of_shadows";
  E.resolveReveal(feast);
  assert.equal(feast.scheme.threat, 1, "Feast of Shadows keeps its printed Doom fallback");

  const wounded = E.newGame("kaelen", "morvane", "normal", "feast-heals-first");
  wounded.villain.hp--;
  wounded.vp.revealed = "feast_of_shadows";
  E.resolveReveal(wounded);
  assert.equal(wounded.villain.hp, 12);
  assert.equal(wounded.scheme.threat, 0, "a partial Feast heal does not also add Doom");
});

test("doom forecast uses the post-spread agenda for a following scheme", () => {
  const morvane = E.newGame("kaelen", "morvane", "normal", "post-spread-scheme");
  morvane.scheme.stage = 1;
  morvane.scheme.threat = E.schemeThreshold(morvane) - 1;
  morvane.intent = "scheme";

  assert.deepEqual(E.doomForecast(morvane), {
    active: true,
    spread: 1,
    scheme: 2,
    effects: 1,
    total: 4,
    remaining: 1,
    advances: true,
    lethal: false,
  });

  E.endTurn(morvane);
  E.stepVillain(morvane);
  assert.equal(morvane.scheme.stage, 2);
  E.ackAgenda(morvane);
  E.stepVillain(morvane);
  assert.equal(morvane.scheme.threat, 3);

  const oszra = E.newGame("sera", "oszra", "normal", "printed-advance-doom");
  oszra.scheme.stage = 1;
  oszra.scheme.threat = E.schemeThreshold(oszra) - 1;
  oszra.intent = "scheme";
  assert.deepEqual(E.doomForecast(oszra), {
    active: true,
    spread: 1,
    scheme: 3,
    effects: 1,
    total: 5,
    remaining: 1,
    advances: true,
    lethal: false,
  });
});

test("doom forecast includes a visible side-scheme burst before the encounter", () => {
  const S = E.newGame("odran", "morvane", "normal", "known-side-burst");
  S.scheme.stage = E.agendaDef(S).stages.length - 1;
  S.scheme.threat = E.schemeThreshold(S) - 4;
  S.round = 2;
  S.intent = "attack";
  S.sideSchemes = [{ uid: "ss-known", c: "the_great_chant", threat: 7 }];

  assert.deepEqual(E.doomForecast(S), {
    active: true,
    spread: 2,
    scheme: 0,
    effects: 3,
    total: 5,
    remaining: 4,
    advances: true,
    lethal: true,
  });
});

test("doom forecast respects sealed activations and warns on the final agenda", () => {
  const S = E.newGame("sera", "nul", "normal", "doom-forecast-lethal");
  S.scheme.stage = E.agendaDef(S).stages.length - 1;
  S.scheme.threat = E.schemeThreshold(S) - 1;
  S.intent = "scheme";
  S.villainSealed = true;

  assert.deepEqual(E.doomForecast(S), {
    active: true,
    spread: 1,
    scheme: 0,
    effects: 0,
    total: 1,
    remaining: 1,
    advances: true,
    lethal: true,
  });

  S.over = { win: false, reason: "scheme" };
  assert.deepEqual(E.doomForecast(S), {
    active: false,
    spread: 0,
    scheme: 0,
    effects: 0,
    total: 0,
    remaining: 1,
    advances: false,
    lethal: false,
  });
});

test("campaign retry aid affects the opening state without breaking deck determinism", () => {
  const base = E.newGame("odran", "morvane", "normal", "resolve-aid");
  const aided = E.newGame("odran", "morvane", "normal", "resolve-aid", { startShield: 2, openingHandBonus: 2 });
  assert.equal(aided.hero.shield, 2);
  assert.equal(aided.hand.length, base.hand.length + 2);
});

test("all hero and villain combinations survive a deterministic smoke matrix", () => {
  for (const hero of HERO_IDS) {
    for (const villain of VILLAIN_IDS) {
      for (const difficulty of ["normal", "nightmare"]) {
        for (let i = 0; i < 20; i++) {
          const S = E.newGame(hero, villain, difficulty, `smoke-${i}`);
          let rounds = 0;
          while (!S.over && rounds++ < 12) {
            assert.equal(E.endTurn(S), null);
            finishVillainPhase(S);
          }
          assert.ok(S.round >= 1);
          assert.ok(S.hero.hp <= S.hero.maxHp);
          assert.ok(S.scheme.threat >= 0);
          assert.ok(S.villain.hp <= E.stage(S).hp + (difficulty === "nightmare" ? 1 : 0));
        }
      }
    }
  }
});

test("auto payment never spends the card being played", () => {
  for (const heroId of HERO_IDS) {
    let verified = false;
    for (let i = 0; i < 100 && !verified; i++) {
      const S = E.newGame(heroId, "morvane", "normal", `payment-${i}`);
      for (const h of S.hand) {
        const card = CARDS[h.c];
        if (card.type === "resource") continue;
        const payment = E.autoPay(S, h.uid);
        if (payment == null || payment.includes(h.uid)) continue;
        const spec = E.targetSpec(S, card);
        const valid = spec ? E.validTargets(S, spec) : [null];
        if (!valid.length) continue;
        const before = S.hand.length;
        assert.equal(E.playCard(S, h.uid, payment, valid[0]), null);
        assert.equal(S.hand.length, before - payment.length - 1 + ((card.effect || {}).draw || 0));
        assert.ok(!S.hand.some((x) => x.uid === h.uid));
        verified = true;
        break;
      }
    }
    assert.ok(verified, `${HEROES[heroId].name} should have a payable opening across sampled seeds`);
  }
});

test("hero actions exhaust once and reset after the villain phase", () => {
  const S = E.newGame("kaelen", "morvane", "normal", "actions");
  assert.equal(E.basicAttack(S, "villain"), null);
  assert.equal(S.hero.exhausted, true);
  assert.notEqual(E.basicAttack(S, "villain"), null);
  assert.equal(E.endTurn(S), null);
  finishVillainPhase(S);
  if (!S.over) assert.equal(S.hero.exhausted, false);
});

test("serialized mid-phase state can resume to the same result", () => {
  const original = E.newGame("odran", "vexahl", "normal", "resume");
  E.endTurn(original);
  E.stepVillain(original);
  const resumed = JSON.parse(JSON.stringify(original));
  finishVillainPhase(original);
  finishVillainPhase(resumed);
  assert.deepEqual(resumed, original);
});
