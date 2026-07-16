// ============================================================
// ASHENMOOR: TWIN VIGILS — multiplayer rules module (server-side).
// Two Wardens fight the same Nightmare (same seed) in linked duels.
// The room is the referee of the SHARED fate: status reports, beacons,
// and the moment the vigil holds or breaks. Card rules themselves run
// in each client against identical seeds; this module cannot be used
// to cheat a partner — there is no hidden information between allies.
// ============================================================
export const meta = { game: "ashenmoor-twin-vigils", minPlayers: 2, maxPlayers: 2 };

export function setup(players) {
  return {
    players,
    reports: {},   // playerId -> latest status snapshot
    beacons: {},   // playerId -> beacons spent (1 allowed)
    aid: {},       // playerId -> beacons RECEIVED (client consumes)
  };
}

export function validateAction(state, playerId, action) {
  if (!action || typeof action !== "object") return { ok: false, error: "malformed action" };
  if (action.kind === "report") {
    if (!action.snap || typeof action.snap !== "object") return { ok: false, error: "malformed report" };
    return { ok: true };
  }
  if (action.kind === "beacon") {
    if ((state.beacons[playerId] || 0) >= 1) return { ok: false, error: "Your beacon is already spent." };
    const partner = state.players.find((p) => p !== playerId);
    if (!partner) return { ok: false, error: "no partner seated" };
    const pr = state.reports[partner];
    if (pr && pr.over) return { ok: false, error: "Your partner's vigil is already decided." };
    return { ok: true };
  }
  return { ok: false, error: "unknown action kind" };
}

export function applyAction(state, playerId, action) {
  if (action.kind === "report") {
    const s = action.snap;
    const clean = {
      heroId: String(s.heroId || "").slice(0, 24),
      hp: Number(s.hp) || 0,
      maxHp: Number(s.maxHp) || 0,
      round: Number(s.round) || 0,
      threat: Number(s.threat) || 0,
      threshold: Number(s.threshold) || 0,
      schemeStage: Number(s.schemeStage) || 0,
      stageIdx: Number(s.stageIdx) || 0,
      stageTitle: String(s.stageTitle || "").slice(0, 60),
      over: !!s.over,
      win: !!s.win,
    };
    return { ...state, reports: { ...state.reports, [playerId]: clean } };
  }
  if (action.kind === "beacon") {
    const partner = state.players.find((p) => p !== playerId);
    return {
      ...state,
      beacons: { ...state.beacons, [playerId]: (state.beacons[playerId] || 0) + 1 },
      aid: { ...state.aid, [partner]: (state.aid[partner] || 0) + 1 },
    };
  }
  return state;
}

export function isGameOver(state) {
  const fallen = state.players.find((p) => state.reports[p] && state.reports[p].over && !state.reports[p].win);
  if (fallen) return { over: true, draw: true, held: false, fallen };
  const allWon = state.players.length >= 2 &&
    state.players.every((p) => state.reports[p] && state.reports[p].over && state.reports[p].win);
  if (allWon) return { over: true, draw: true, held: true };
  return { over: false };
}

export function viewFor(state) {
  return state; // fully cooperative: no secrets between Wardens
}
