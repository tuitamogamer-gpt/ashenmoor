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

Balance matrix examples:

```bash
DIFFICULTIES=normal,nightmare GAMES=1000 node tools/sim.mjs
CAMPAIGN=1 DIFFICULTY=normal GAMES=500 node tools/sim.mjs
TRACE=sera,nul,my-seed,nightmare node tools/sim.mjs
```

Append `?dev=1` for development controls or `?test=1` for deterministic browser timing. Automated browser runs can read `window.render_game_to_text()` and advance paced villain steps with `window.advanceTime(ms)`.

The Daily Vigil derives its Warden, Nightmare, and shuffle seed from the local calendar date, so retries on the same day are comparable. Completed-game statistics and the most recent 20 runs stay in local storage.

## Balance reference

The current smart-policy 1,000-game matrix has Normal matchup win rates of 31.6%–68.2% and Nightmare rates of 15.2%–53.3%, with no crashes or 200-round stalls. The three-act campaign completed at 57.2%–87.1% on Normal and 14.5%–52.0% on Nightmare in 1,000-run samples. These are regression ranges, not promises about human win rate.

## Architecture

- `js/engine.js`: pure serializable rules engine
- `js/cards.js`: heroes, player cards, encounters, villains, and agendas
- `js/ui.js`: DOM rendering, interaction, save/resume, and villain-phase presentation
- `js/campaign.js`: The Long Vigil campaign state
- `tools/sim.mjs`: headless balance simulator
- `test/`: deterministic engine and campaign regression tests
