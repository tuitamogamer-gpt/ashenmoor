# Ashenmoor

Ashenmoor is a zero-runtime-dependency solo browser card game. Choose a Warden, manage cards as both actions and payment, and defeat a three-stage Nightmare before its agenda completes.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm run serve
```

Open `http://127.0.0.1:8642/`.

Useful commands:

```bash
npm run check        # syntax and engine/campaign tests
npm run test:sim     # balance smoke matrix
npm run test:browser # desktop and mobile interaction smoke test
```

On a fresh machine, install the browser binary once before the browser smoke test:

```bash
npx playwright install chromium
```

If a Chromium build is already installed elsewhere (one that differs from what this Playwright version would download), point the smoke test at it instead:

```bash
CHROMIUM_PATH=/path/to/chrome npm run test:browser
```

Balance matrix examples:

```bash
DIFFICULTIES=normal,nightmare GAMES=1000 node tools/sim.mjs
CAMPAIGN=1 DIFFICULTY=normal GAMES=500 node tools/sim.mjs
TRACE=sera,nul,my-seed,nightmare node tools/sim.mjs
```

Append `?dev=1` for development controls or `?test=1` for deterministic browser timing. Automated browser runs can read `window.render_game_to_text()` and advance paced villain steps with `window.advanceTime(ms)`.

The Daily Vigil derives its Warden, Nightmare, and shuffle seed from the local calendar date, so retries on the same day are comparable. Completed-game statistics (overall, per Warden, per Nightmare and per difficulty) and the most recent 20 runs stay in local storage.

## Offline play and installing

The deployed game is a small Progressive Web App: `manifest.webmanifest` makes it installable (home screen / desktop app, standalone window) and `sw.js` keeps a copy of every file the game uses so a Vigil can be started with no connection. The service worker is network-first — online players always get the files that are deployed right now, and the cache is only the fallback — so a deploy can never be pinned behind a stale copy.

It registers only on `https:` deployments, never on the local dev server, in `?test=1` runs or in the co-op build; append `?sw=1` to try it locally. After adding or removing art, icons, sounds or modules, regenerate the precache list (a unit test fails until you do):

```bash
node tools/gen-sw.mjs
```

## Controls

Everything can be played with the keyboard: Tab through the hand, the hero's actions and the board, Enter/Space to select and play, Enter to confirm a payment, Esc to cancel, E to end the turn, H for the rules, M to mute and F for fullscreen. Focus survives every board update, moves to the valid targets when a card needs one, and returns to End Turn after the villain phase. The letter shortcuts are ignored while typing in a text field and whenever Ctrl, Cmd or Alt is held.

## Balance reference

The current smart-policy 1,000-game matrix has Normal matchup win rates of 31.6%–68.2% and Nightmare rates of 15.2%–53.3%, with no crashes or 200-round stalls. The three-act campaign completed at 57.2%–87.1% on Normal and 14.5%–52.0% on Nightmare in 1,000-run samples. These are regression ranges, not promises about human win rate.

## Design notes

- Typography: Cinzel (display) and EB Garamond (card and body serif), self-hosted from `assets/fonts/` under the SIL Open Font License, so the game still makes no third-party requests.
- Board card sizes are CSS variables driven by the viewport height (`--hand-w`, `--boss-w`, …); card text is sized in container-query units so a card reads the same in the hand, the inspector, and modals.
- On desktop and landscape screens the whole board fits one screen: the allies zone takes the leftover height and scales its cards to it. Portrait phones and very short windows scroll instead.

## Architecture

- `js/engine.js`: pure serializable rules engine
- `js/cards.js`: heroes, player cards, encounters, villains, and agendas
- `js/ui.js`: DOM rendering, interaction, save/resume, and villain-phase presentation
- `js/campaign.js`: The Long Vigil campaign state
- `sw.js` / `manifest.webmanifest`: offline cache and install metadata (`tools/gen-sw.mjs` regenerates the precache list)
- `tools/sim.mjs`: headless balance simulator
- `tools/browser-smoke.mjs`: desktop, keyboard, phone, villain-phase, Daily Vigil and offline browser checks
- `test/`: deterministic engine, campaign and service-worker regression tests
