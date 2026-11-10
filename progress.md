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

## 2026-10-23 — v2.6 Polish (design pass)

Request: "Sredi dizajn i sve".

- [x] Self-hosted Cinzel + EB Garamond; the previously referenced-but-never-loaded "Cinzel" now actually renders.
- [x] Menu reorganized: utility bar (Statistics, How to Play, Settings, sound), Warden and Nightmare pickers, difficulty, and a sticky call-to-action bar with Begin / Campaign / Daily.
- [x] Fixed hero picker cards with uneven art heights (buttons centred their content vertically).
- [x] Board: viewport-height card sizing, allies zone that sizes its cards to the remaining height, empty-state hint, upgrades pinned to the zone header, minions laid out in a row (they used to stack vertically and push the hand off-screen).
- [x] Hero card shows title and ability; hero actions stay rendered (disabled) through the villain phase so the layout no longer jumps.
- [x] Pay / target / resource docks moved from a fixed overlay on the hero card to the seam above the hand.
- [x] Card text scales with card width (container-query units); inspector is a framed panel; mobile topbar wraps correctly.
- [x] Help modal has a fixed footer; mulligan fits a full hand on one row; campaign hub typography and mobile act row.
- [x] Each villain has its own inspector flavor line (all four used to show Morvane's).

Verification: `npm run check` (19/19), browser smoke test, and screenshots at 1440×900, 1280×720, 1024×640, 844×390 and 390×844 with an empty and a fully crowded board.

## 2026-11-10 — v2.7 Wayfarer (continued improvements)

Request: "nastavi poboljšanja pa push na main" — continue the improvements on top of the unmerged v2.6 Polish branch (PR #1) and ship both to main.

Found by exercising every screen at 1440×900, 1280×720, 1024×640, 844×390 and 390×844 (each reproduced in a browser before fixing):

- [x] Typing in the discard-pile search box triggered the H/M/F/E shortcuts (typing "ash" produced "as" and opened How to Play); Ctrl+F toggled fullscreen. Letter shortcuts now ignore text fields and Ctrl/Cmd/Alt chords.
- [x] Every action re-rendered the board and dropped keyboard focus on `<body>`. Focus is now restored to the same control, moves to the valid targets in targeting mode and to the pay controls in pay mode, and returns to End Turn when the villain phase's last dialog closes; the opening-hand dialog focuses Keep hand.
- [x] Phones: an overflowing hand was centred with `justify-content: center`, so the first card hung off the left edge where it could never be scrolled to. The hand is now centred with auto margins.
- [x] Phones: the 44px ally action buttons covered the ally's stats and health; they now hang below the card with space reserved.
- [x] The boost-card flash and the "Your turn" banner rendered above the defense / encounter / recap dialogs and hid their text; they are cleared when a decision dialog opens.
- [x] Hovering another card while one was selected showed the hovered card in the inspector with a Play button that would play the selected one. The Play button now only appears under the selected card; closing the inspector also drops the card's lifted look.
- [x] Resource cards were announced as "cost null" to screen readers; a battle saved before the mulligan resumed without the mulligan; the End Turn hint always named the Hollow King; the rules' ability list skipped Ilva; the end-of-game dialog could be opened twice.
- [x] An agenda notice raised by the player's own action (e.g. a reshuffle doom or a dev/test hit) stayed open under the end-of-game dialog and reappeared over the main menu, blocking it. A decided or abandoned battle now closes it, and the villain-phase driver stops cleanly if its battle is replaced mid-await.
- [x] While choosing a target, Tab walks only the valid targets (the agenda and other non-targets drop out of the tab order).
- [x] The defense dialog (which hides the board) now shows the Warden's health, shield and DEF and each blocker's health.
- [x] How to Play uses the painted medallion icons instead of the old text glyphs (✦ shows the current Warden's own sigil).
- [x] Statistics also show the per-Nightmare and per-difficulty records that have been recorded since v1.9.
- [x] Installable, offline-capable PWA: web manifest, app icons cut from the crown favicon, and a network-first service worker that precaches the 162 files the game uses (generated list, kept in sync by a unit test).

Verification:

- `npm run check`: syntax clean (20 files) and 23/23 tests pass (4 new service-worker/manifest tests).
- `npm run test:browser`: new keyboard-only flow (focus after select, typing in search, Ctrl chords, defense status, focus back on End Turn), phone hand reachability, phone ally buttons vs. stats, a decided battle leaving no dialog over the menu (confirmed failing without the fix), and an offline restart with the dev server stopped — all pass alongside the existing desktop, mobile, villain-phase and Daily Vigil checks.
- Screenshots of every screen re-inspected at all five viewports after the changes; no console errors.
- `GAMES=250 node tools/sim.mjs`: 0 crashes, 0 stalls (rules unchanged apart from extra read-only fields on `defenseOptions`).
