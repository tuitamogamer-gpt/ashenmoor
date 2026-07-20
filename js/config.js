// All balance and pacing numbers live here (tuned as data, not code).
export const CONFIG = {
  saveKey: "ashenmoor_save_v1",
  prefsKey: "ashenmoor_prefs_v1",
  allyLimit: 3,
  minionLimit: 3,
  handCap: 10,
  doomPerRound: 1,
  reshuffleDoom: 1,
  crowdedDoom: 2,        // doom added instead of spawning a 4th minion
  consequential: 1,      // damage an ally takes after attacking/disrupting
  stepMs: 1350,          // pacing between villain-phase steps (slow enough to read)
  logCap: 250,
  difficulty: {
    normal:    { villainHpBonus: 0, villainAtkBonus: 0 },
    nightmare: { villainHpBonus: 1, villainAtkBonus: 1 },
  },
};
