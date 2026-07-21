Original prompt: "Hajde, evaluiraj ovu igru i onda mi napravi plan. Nemoj ga krenuti bez moje dozvole. Napravi plan šta bi se ovde moglo poboljšati" — after reviewing the plan, the user approved implementation with: "uradi sve".

## Active implementation plan

- Build deterministic engine, matchup, difficulty, and campaign test coverage.
- Rebalance Normal/Nightmare and the three-act campaign using simulation evidence.
- Fix mobile card inspection/play, long menu flow, touch targets, and destructive-action confirmation.
- Add semantic/keyboard accessibility and richer onboarding.
- Add automated browser hooks, smoke tests, CI, and developer documentation.
- Finish with run statistics and quality-of-life polish, then verify desktop and mobile end to end.

## Baseline evidence

- Existing 9,000-game smart-policy Normal matrix: matchup win rates 1.2%–27%; Nul 1.2%–1.9% for all heroes; no simulator crashes.
- Existing 9,000-game baseline-policy matrix: mostly 0%–2.7% except Kaelen/Vexahl; no simulator crashes.
- Browser flow through mulligan, card payment, villain defense, encounter reveal, and recap had no console errors.
- Confirmed mobile issue: selected card's Play button is rendered in an inspector hidden below 980px, so an undocumented second tap is required.
- Confirmed accessibility issue: hero/villain/hand choices use clickable divs and icon-only controls lack accessible names.

## TODO

- [x] Add package/test/CI scaffolding and deterministic UI state hooks.
- [x] Expand simulator across difficulties and campaigns; set balance targets.
- [x] Tune cards/villains/campaign and rerun large matrices.
- [x] Implement mobile, accessibility, onboarding, and confirmation improvements.
- [x] Add statistics/run summary and final documentation.
- [x] Run exhaustive engine, simulator, browser, screenshot, responsive, and console-error verification.

## Final verification

- 14 deterministic engine/campaign/simulator tests pass.
- 1,000-game-per-row Normal and Nightmare matrices complete with no crashes or stalls.
- 1,000-run-per-hero campaign matrices complete with no crashes or stalls.
- Browser smoke covers desktop, 390×844 mobile, selecting/playing a card, a full villain phase, confirmation dialogs, statistics, and deterministic Daily Vigil seeds.
- Desktop and mobile screenshots were inspected; the mobile card bottom sheet and Play action remain inside the viewport.

## 2026-07-21 follow-up — Doom Forecast

Current request: "možeš li dodati nešto sada ovoj igri? Meni se cini jedino doom mehanika da je čudna"

- [x] Audit the Doom engine, UI, rules copy, deterministic tests, and balance baseline.
- [x] Add an engine-owned forecast for known Doom Spread plus a telegraphed SCHEME activation.
- [x] Show NEXT Doom, source breakdown, projected pips, and advance/defeat warnings on the agenda and its inspector.
- [x] Expose the same forecast through `render_game_to_text` and add focused engine/browser assertions.
- [x] Fix a rules leak where every failed villain heal secretly added Doom; only Feast of Shadows now uses its printed +1 Doom fallback.
- [x] Run syntax/tests, balance smoke, Playwright gameplay loop, and inspect desktop/mobile screenshots.

Verification:

- `npm run check`: syntax clean and 19/19 deterministic tests pass.
- `npm run test:browser`: desktop/mobile Doom card, touch inspector, exact agenda-boundary forecast, known effect breakdown, final-agenda defeat warning, full villain phase, and console checks pass.
- Required web-game Playwright client completed with matching `render_game_to_text` forecast state and no console-error artifact.
- 8,000 Normal plus 8,000 Nightmare matchup simulations: 0 crashes, 0 stalls; aggregate win rates 45.7% / 21.8%.
- 1,000 Normal plus 1,000 Nightmare campaign simulations: 0 crashes, 0 stalls; aggregate completion rates 76.8% / 26.6%.
- Inspected `doom-forecast.png`, `doom-scheme-forecast.png`, `doom-effects-forecast.png`, `doom-defeat-forecast.png`, `doom-inspector.png`, and `mobile-doom-inspector.png`; forecast, breakdown, projected pips, advance/defeat warnings, and the full mobile inspector are visible without clipping.

Optional next tuning step (not required for this feature): if human play still feels too punishing after the hidden Doom is now visible, test capping agenda overflow at 1 before changing thresholds.
