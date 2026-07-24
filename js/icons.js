// ============================================================
// ASHENMOOR — icon set. Painted medallions generated with OpenArt
// (assets/icons/*.jpg), served at 3x the display size so they stay
// sharp on retina. Each hero's ability keys off its ability.kind.
// ============================================================
export const iconPath = (id) => `./assets/icons/${id}.jpg`;

const img = (id, cls) =>
  `<img class="ic ${cls}" src="${iconPath(id)}" alt="" aria-hidden="true" draggable="false">`;

export const ICON = {
  atk: img("ic_atk", "ic-atk"),
  thw: img("ic_thw", "ic-thw"),
  def: img("ic_def", "ic-def"),
  hp: img("ic_hp", "ic-hp"),
  doom: img("ic_doom", "ic-doom"),
  sch: img("ic_sch", "ic-sch"),
  burst: img("ic_burst", "ic-burst"),
  res: img("ic_res", "ic-res"),
};

// hero abilities: one painted sigil each, chosen by ability kind so a new
// hero only needs its kind mapped here
const ABILITY_BY_KIND = {
  dmg1: "ic_ab_emberheart",
  thw1: "ic_ab_riftsight",
  shield1: "ic_ab_aegis",
  packHeal1: "ic_ab_wildcall",
};

export function abilityIcon(kind) {
  const id = ABILITY_BY_KIND[kind];
  return id ? img(id, "ic-ability") : "";
}
