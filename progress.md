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
