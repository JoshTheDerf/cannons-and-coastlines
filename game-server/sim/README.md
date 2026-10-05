# Pacing simulator

The balance tests (`scripts/balance.mjs`) ask whether the game is fair.
This asks whether it gets going: how many rounds pass before two fleets
are in range, before the first hit lands, how much of the game is spent
with nobody hitting anything, and, with four or more players, whether
fleets that don't sit side by side ever meet.

It plays the real rules engine (the same bundle as the web game and the
online server) with the computer captain in every seat. Rule ideas are
**variants**, ways of playing are **styles**, and tables and seatings are
**scenarios**. Every variant plays the same seeded games, so a difference
in the table is the rule change, not the luck of the draw.

```bash
npm run sim                                   # every idea in DEFAULT_SWEEP, default tables (~15 min on 6 cores)
npm run sim:quick                             # a third of the games
npm run sim -- --variants deploy:18,deploy+dash --scenarios duel-opposite
npm run sim -- --vs raider                    # one seat charges in, the rest play the computer
npm run sim -- --fleets base                  # Queen's Fleet and Corsairs only
npm run sim -- --json /tmp/run.json           # keep every game's record
npm run sim -- --from /tmp/run.json --focus opening   # report a saved run again
npm run sim -- --list                         # what there is to run
```

The baseline (the rulebook as printed) always runs first, and every other
row shows its change from it. A `*` means the change is bigger than the
noise (a paired test at 95%); no star means it could be dice.

## Files

| File | What's in it |
|---|---|
| `variants.mjs` | Rule ideas. Add one here. |
| `styles.mjs` | Playstyles for `--vs`. |
| `scenarios.mjs` | Tables, seatings and player counts. |
| `play.mjs` | One game and what it records. `SECONDS` is the table-time guess behind the minutes columns. |
| `run.mjs` | Command line, worker threads and the report. |
| `engine.mjs` | Builds the hookable engine copy into `.build/` (ignored by git). |

## Writing a variant

A variant is a spec in `VARIANTS`, or a function from its colon arguments
to one. The `rule` text is how the rule would read in the rulebook, so the
report says what was tested in the words a player would see.

```js
bounty: (fitting = 6, hull = 12) => ({
  label: `Prizes ${fitting}/${hull}`,
  rule: `Prize fittings score ${fitting} (was 4) and prize hulls ${hull} (was 8).`,
  apply(X) { X.VP_PRIZE_FITTING = fitting; X.VP_PRIZE_HULL = hull; },
}),
```

`X` holds every top-level name in the engine (constants, rule functions,
the computer captain's functions, and `X.G`, the game in progress).
Setting `X.SOMETHING` or wrapping a function with
`wrap(X, 'name', orig => (...args) => ...)` changes what the engine itself
calls, because the engine's own calls go through the same names. Each
variant runs on its own copy of the engine, so nothing leaks between them.

There are three ways to make a change:

- **Constants and tables:** `X.CLICK_LEN = 5`, `X.FACTION_DEFS.corsairs.moveCount = 5`.
- **Wrapping a function:** see `dash` (wraps `beginTurn`), `treasure`
  (wraps `randomIslands` and `scoreBreakdown`), `swingfire` (wraps
  `ACTIONS.fire` and the computer's `aiBestShot`).
- **Source patches** for a change in the middle of a function:
  `patch: [{ find: '…', replace: '…' }]`. Each must match exactly once.

**Teach the computer.** If a rule changes what a good move is, the computer
has to know, or the test measures a captain that ignores the rule. Wrap
`aiEvalPose` to change where ships want to end up (see `storm`), set
`X.__simIslandValue` to change which islands the fleet goes for (see
`treasure`), or wrap `aiBestShot` for new kinds of shot (see `swingfire`).

## Can a rule be gamed?

The computer plays every rule the same honest way, so a rule that gives
players a choice (where to deploy, when to use something) needs a test
where one seat makes that choice as cleverly as it can. That is a style
with a `deploy(X, p)` hook: it runs after setup and may re-place its own
fleet. `deployer` places each ship last, seeing every other fleet, at the
spot the computer rates best within the deploy variant's limits;
`deployer-aim` may also turn ships to point a broadside. Run one with
`--vs deployer --focus opening`: it should win about its fair share, and
its early net (hits dealt minus taken in rounds 1-2) should sit near zero.

`--focus opening` swaps the columns for the first rounds: hits in round 1,
hits on a fleet before its first turn, ships touching an island at the
start, and flags raised in rounds 1-2.

## Reading the columns

| Column | Meaning |
|---|---|
| rounds | Game length. |
| in range | First round two enemy ships are within 55 cm (gun range). |
| 1st hit | Round of the first hit. `1st hit %` is how far into the game that is. |
| hit min | Estimated table minutes to the first hit (from `SECONDS` in `play.mjs`). |
| hits/rnd | Hits per round, for the whole table. |
| quiet % | Share of rounds in which nobody landed a hit. |
| drought | Longest run of rounds with no hit. |
| flips | Islands taken from another fleet. |
| lead chg | Times the clear leader changed. |
| far met %, far hits % | 4+ players: pairs of seats not side by side that ever traded hits, and their share of all hits. |
| seat 1 | First player's win rate (fair is 1/n). |
| fleets | Lowest and highest fleet win rate, as a multiple of a fair share. A speed-up that breaks this isn't one. |
| early net | With `--vs`: hits the challenger dealt minus hits it took in rounds 1-2. |
| *style* (x fair) | With `--vs`: the challenger's win rate as a multiple of fair, with a 95% interval. Above 1 means that way of playing beats the computer. |

Rounds are counted as `balance.mjs` counts them: seat 1's turn in round
*r* is *r*.0, the next seat's *r* + 1/n.

## Limits

- The computer plays one way (well). Real players bluff, misjudge range
  and get impatient; `--vs` with another style is the nearest stand-in.
- The minutes are a guess built from per-action seconds. Time a playtest
  and tune `SECONDS` to make them yours.
- Shots use the engine's cannon model, tuned against the printed cannons
  (`scripts/cannon-stats.mjs`), not your actual springs.
