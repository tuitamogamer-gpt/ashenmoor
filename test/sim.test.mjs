import test from "node:test";
import assert from "node:assert/strict";

import { playCampaign, playGame } from "../tools/sim.mjs";

test("simulator honors difficulty and returns the final serializable state", () => {
  const normal = playGame("kaelen", "morvane", "difficulty", false, { difficulty: "normal" });
  const nightmare = playGame("kaelen", "morvane", "difficulty", false, { difficulty: "nightmare" });
  assert.equal(normal.state.difficulty, "normal");
  assert.equal(nightmare.state.difficulty, "nightmare");
  assert.ok(normal.state.over || normal.stalled);
  assert.ok(nightmare.state.over || nightmare.stalled);
});

test("campaign simulator is deterministic for a fixed seed", () => {
  const a = playCampaign("odran", "normal", "campaign-repeat");
  const b = playCampaign("odran", "normal", "campaign-repeat");
  assert.deepEqual(a, b);
  assert.ok(a.act >= 0 && a.act <= 3);
  assert.ok(a.attempts.length > 0);
});
