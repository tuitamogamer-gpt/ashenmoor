// Ashenmoor is a fully client-side solo card game; the platform requires a
// rules module at the zip root, so this is the sanctioned solo stub.
export const meta = { game: "ashenmoor", minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
