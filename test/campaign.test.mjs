import test from "node:test";
import assert from "node:assert/strict";

const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.has(key) ? storage.get(key) : null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

const CAMP = await import("../js/campaign.js");

test.beforeEach(() => storage.clear());

test("campaign save/load and deck editing round-trip", () => {
  const c = CAMP.start("sera", "normal");
  assert.equal(CAMP.load().heroId, "sera");
  const initial = c.deck.length;
  const options = CAMP.draftOptions(c);
  assert.equal(options.length, 3);
  assert.equal(new Set(options).size, 3);
  CAMP.addCard(c, options[0]);
  assert.equal(c.deck.length, initial + 1);
  assert.equal(CAMP.removeCard(c, options[0]), true);
  assert.equal(c.deck.length, initial);
});

test("campaign win advances an act and preserves consequences", () => {
  const c = CAMP.start("kaelen", "normal");
  CAMP.applyWin(c, {
    hero: { hp: 3 },
    scheme: { stage: 1 },
    stats: { rounds: 8, dmgDealt: 42 },
  });
  assert.equal(c.act, 1);
  assert.equal(c.scars, 0);
  assert.equal(c.extraDoom, 1);
  assert.equal(c.history[0].result, "win");
});

test("a critical-health win adds a scar", () => {
  const c = CAMP.start("kaelen", "normal");
  CAMP.applyWin(c, {
    hero: { hp: 2 },
    scheme: { stage: 0 },
    stats: { rounds: 9, dmgDealt: 36 },
  });
  assert.equal(c.scars, 1);
  assert.equal(c.extraDoom, 0);
});

test("campaign loss records a retry consequence", () => {
  const c = CAMP.start("odran", "nightmare");
  CAMP.applyLoss(c, { stats: { rounds: 5, dmgDealt: 12 } });
  assert.equal(c.act, 0);
  assert.equal(c.scars, 0);
  assert.equal(c.lastLossScarred, false);
  assert.equal(c.resolve, 1);
  CAMP.applyLoss(c, { stats: { rounds: 6, dmgDealt: 15 } });
  assert.equal(c.scars, 1);
  assert.equal(c.lastLossScarred, true);
  assert.equal(c.resolve, 2);
  assert.equal(c.history[0].result, "loss");
});

test("campaign grace is spent once for the whole run", () => {
  const c = CAMP.start("sera", "normal");
  CAMP.applyLoss(c, { stats: { rounds: 4, dmgDealt: 9 } });
  c.act = 1;
  CAMP.applyLoss(c, { stats: { rounds: 5, dmgDealt: 11 } });
  assert.equal(c.scars, 1);
  assert.equal(c.lastLossScarred, true);
});
