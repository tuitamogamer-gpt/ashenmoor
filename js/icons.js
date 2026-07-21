// ============================================================
// ASHENMOOR — inline SVG icon set. Crisp at any size (1em box),
// two-tone fills matched to the game palette. No external assets,
// no gradient ids (safe to repeat inline hundreds of times).
// ============================================================
const svg = (body, cls) =>
  `<svg class="ic ${cls}" viewBox="0 0 16 16" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICON = {
  // sword — ember blade, gold guard
  atk: svg(
    `<path d="M14.6 1.4 Q12 1.6 9.8 3.2 L5.2 7.8 L8.2 10.8 L12.8 6.2 Q14.4 4 14.6 1.4 Z" fill="#e8ddc6"/>
     <path d="M14.6 1.4 Q12 1.6 9.8 3.2 L6.7 6.3 L8 7.6 Z" fill="#ffb35c"/>
     <path d="M4.3 6.5 L9.5 11.7 L8.4 12.8 L3.2 7.6 Z" fill="#c9a45c"/>
     <path d="M4.4 9.7 L6.3 11.6 L3.4 14.5 Q2.4 15 1.7 14.3 Q1 13.6 1.5 12.6 Z" fill="#8a6a34"/>`,
    "ic-atk"),
  // disrupt — teal rift spark
  thw: svg(
    `<path d="M8 0.8 L9.6 6.4 L15.2 8 L9.6 9.6 L8 15.2 L6.4 9.6 L0.8 8 L6.4 6.4 Z" fill="#3fc9b6"/>
     <path d="M8 3.6 L9 7 L12.4 8 L9 9 L8 12.4 L7 9 L3.6 8 L7 7 Z" fill="#bff2e9"/>`,
    "ic-thw"),
  // shield — steel face, gold rim
  def: svg(
    `<path d="M8 0.9 L14 3 V7.6 Q14 12.6 8 15.1 Q2 12.6 2 7.6 V3 Z" fill="#c9a45c"/>
     <path d="M8 2.4 L12.6 4 V7.7 Q12.6 11.6 8 13.7 Q3.4 11.6 3.4 7.7 V4 Z" fill="#4c5668"/>
     <path d="M8 2.4 L12.6 4 V7.7 Q12.6 9 12 10.2 L8 6.8 V2.4 Z" fill="#6b7890"/>`,
    "ic-def"),
  // heart — blood red with highlight
  hp: svg(
    `<path d="M8 14.2 Q1.4 9.6 1.4 5.3 Q1.4 2.4 4.1 2.4 Q6.3 2.4 8 4.8 Q9.7 2.4 11.9 2.4 Q14.6 2.4 14.6 5.3 Q14.6 9.6 8 14.2 Z" fill="#d84a5a"/>
     <path d="M4.6 3.9 Q3.2 3.9 3 5.6 Q3 6.4 3.6 7.4 Q3.2 5 4.9 4.4 Z" fill="#ffb3bc"/>`,
    "ic-hp"),
  // doom — void diamond
  doom: svg(
    `<path d="M8 0.9 L14.4 8 L8 15.1 L1.6 8 Z" fill="#a184ff"/>
     <path d="M8 3.3 L12.1 8 L8 12.7 L3.9 8 Z" fill="#5b3fb8"/>
     <path d="M8 3.3 L12.1 8 L8 8 Z" fill="#c9b6ff"/>`,
    "ic-doom"),
  // scheme — watching eye
  sch: svg(
    `<path d="M8 3.4 Q13 3.4 15.2 8 Q13 12.6 8 12.6 Q3 12.6 0.8 8 Q3 3.4 8 3.4 Z" fill="#5b3fb8"/>
     <circle cx="8" cy="8" r="3.1" fill="#d8ccff"/>
     <circle cx="8" cy="8" r="1.5" fill="#1c1030"/>`,
    "ic-sch"),
  // burst — detonation star
  burst: svg(
    `<path d="M8 0.6 L9.3 5 L13.4 2.6 L11 6.7 L15.4 8 L11 9.3 L13.4 13.4 L9.3 11 L8 15.4 L6.7 11 L2.6 13.4 L5 9.3 L0.6 8 L5 6.7 L2.6 2.6 L6.7 5 Z" fill="#ff8a3d"/>
     <circle cx="8" cy="8" r="2.4" fill="#ffd9a8"/>`,
    "ic-burst"),
  // resource — teal gem (the hand-as-mana tracker)
  res: svg(
    `<path d="M4.2 1.8 H11.8 L15 5.8 L8 14.6 L1 5.8 Z" fill="#3fc9b6"/>
     <path d="M4.2 1.8 H11.8 L13 3.4 H3 Z" fill="#bff2e9"/>
     <path d="M5.6 5.8 L8 14.6 L1 5.8 Z" fill="#2a8d7f"/>`,
    "ic-res"),
};
