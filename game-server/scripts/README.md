# Game server scripts

Everything here runs the same rules engine as the web game and the online
server: `build-engine.mjs` bundles `nuxt-site/public/game/{constants,geometry,state,rules,brain}.js`
into `src/engine.gen.js`. The npm scripts rebuild it first.

| npm script | What it does |
|---|---|
| `check` | Engine self-test: rules unit checks plus full computer games at 2–7 seats, and every cannon slot against its hull's hole in the 3D assemblies. |
| `balance` | Balance tests: seeded computer-vs-computer games in worker threads. Every two-player pairing, 3/4/6-player free-for-alls, mixed computer styles, parking (turtle) against fighting (raider), and playing for coins (banker). Fails when a fleet or style leaves its limits (by 95% interval). `--quick`, `--games N`, `--report`, `--logs [file.jsonl]` for patterns from the action logs, `--only id,...`, `--engine file.js`. |
| `balance:tables` | The same on real tables (6 ft round, 6 and 8 ft folding, every two-player seating): how soon the fighting starts on each, and the fleet spread. |
| `variant` | Build a patched engine for an A/B test: `npm run variant -- /tmp/v.js --set VP_COIN=2 --replace "find" "replace"`, then `node scripts/balance.mjs --engine /tmp/v.js`. Each edit must match exactly once. |
| `start-lanes` | Start-zone exposure: the share of ships with a shot at another fleet after one turn. `--table`, `--players`, `--engine`, `--layout past:inward:r[:row2]` to try flank-rock layouts on an engine built without them. |
| `table-fit` | Islands placed and fleets fitted for each table and player count. |
| `bump-stats` | How often computer ships sail into things: the share of moves stopped short by a rock, a reef, an island with nothing to do there, their own fleet, an enemy or the table edge, and ships that could not move at all. `--games N`, `--engine`. |
| `cannon-stats` | Shot model statistics per elevation (landing, travel, spread, curl), for tuning against the printed cannons. |
| `map-preview` | Quick-start maps as an HTML page of SVGs: `npm run map-preview -- /tmp/maps.html --maps round6:6:3,fold8:4:1`. |
| `ui-smoke` | Browser smoke tests in headless Chromium (Playwright): firing, collecting at sea, Full Sail, picking up the next ship, dead ships, tables and seating. `-- --online` also starts `wrangler dev` and tests an online game. First run on a new machine: `npx playwright install chromium`. |
| `tournament` | The older head-to-head: tactical against plain computers, and Stone Fleet tables. |

The computer styles `turtle`, `raider` and `banker` in `brain.js` exist for
these tests; games never use them unless a test sets `G.aiStyle`.
