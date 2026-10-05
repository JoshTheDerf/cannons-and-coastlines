// Rule variants for the simulator: the place to try an idea.
//
// A variant is a named change to the rulebook. Name one on the command line
// (`--variants deploy`), give it arguments after colons (`deploy:18`), and
// stack several with `+` (`deploy:12+dash`). Each entry is a spec, or a
// function from its arguments to a spec. A spec can have:
//
//   label        short name for the tables
//   rule         the rule as it would read in the rulebook
//   opts         extra newGame options (winds, stalemate)
//   table        play on this table instead of the scenario's (a TABLES id)
//   patch        [{ find, replace }] exact-once edits to the engine source,
//                for a change in the middle of a function
//   apply(X)     runs once on the variant's own engine: set constants
//                (X.VP_PRIZE_FITTING = 6) or wrap functions (wrap(X, 'beginTurn', ...))
//   afterSetup(X) runs after each newGame, before the first action
//
// X is every top-level name in the engine (see engine.mjs): constants,
// rule functions, the computer captain's functions and X.G, the game.
// When a rule changes what a good move is, teach the computer about it too
// (wrap aiEvalPose for where to sail, set X.__simIslandValue for which
// islands to go for), or the test measures a computer that ignores it.

/** Replace obj[name] with make(original). */
export function wrap(obj, name, make) {
  const orig = obj[name];
  if (typeof orig !== 'function') throw new Error(`wrap: ${name} is not a function`);
  obj[name] = make(orig);
}

/** The round the game is in (1 = everyone's first turn). */
export const roundOf = X => Math.floor((X.G.turn - 1) / X.G.order.length) + 1;

const IN = 2.54;
const HIT = ['fitting', 'dead', 'sunk'];

/** May ship s deploy at pose ps under the deploy limits (cfg in cm), with these enemy ships already down? */
export function deployOk(X, s, ps, cfg, enemies) {
  if (cfg.clear && X.islands().some(t => X.shoreGap(s, t, ps) < cfg.clear)) return false;
  if (cfg.gap && enemies.some(e => X.segSegDist(X.shipSeg(s, ps), X.shipSeg(e)) - s.wid / 2 - e.wid / 2 < cfg.gap)) return false;
  return true;
}

/** Add `bonus(p)` points to every seat's score, wherever the engine scores. */
function addScore(X, bonus) {
  wrap(X, 'scoreBreakdown', orig => () => {
    const sc = orig();
    for (const p of X.G.order) { const b = bonus(p); sc[p].base += b; sc[p].total += b; sc[p].extra = (sc[p].extra || 0) + b; }
    return sc;
  });
}

export const VARIANTS = {
  baseline: { label: 'Rulebook v0.6', rule: 'The rules as printed.' },

  // ─── Close the distance ──────────────────────────────

  // clear: keep this many inches of water between a deployed ship and any
  // island. gap: keep this many inches from every ship already deployed by
  // another fleet (fleets deploy in turn order). The 'deployer' style
  // (styles.mjs) reads X.__simDeploy to game the same limits.
  deploy: (inches = 12, clear = 0, gap = 0) => ({
    label: `Deploy ${inches}" in${clear ? `, ${clear}" off isl` : ''}${gap ? `, ${gap}" apart` : ''}`,
    rule: `Deploy your fleet anywhere up to ${inches}" in from your stretch of table edge, facing straight in.${clear ? ` No ship within ${clear}" of an island.` : ''}${gap ? ` No ship within ${gap}" of another fleet's ships (fleets deploy in turn order).` : ''}`,
    apply(X) {
      X.__simDeploy = { depth: inches * IN, clear: clear * IN, gap: gap * IN };
      // Each ship sails straight in from its edge spot, stopping short of
      // anything in the way, and backs off until it keeps its distances.
      wrap(X, 'autoDeploy', orig => p => {
        orig(p);
        const enemies = X.allShips().filter(e => e.owner !== p);
        for (const s of X.G.players[p].ships) {
          const sl = X.planSlide(s, s, s.h, inches * IN), f = X.fwdVec(s.h);
          const at = d => ({ x: s.x + f.x * d, y: s.y + f.y * d, h: s.h });
          let d = Math.max(0, sl.moved - (sl.stoppedBy ? 2 : 0));
          while (d > 0 && !deployOk(X, s, at(d), X.__simDeploy, enemies)) d = Math.max(0, d - 1);
          Object.assign(s, at(d));
        }
      });
    },
  }),

  deploytouch: {
    label: 'Deployed touching counts',
    rule: 'A ship deployed touching an island counts as touching it at the end of your previous turn, so it may Raise Flag on its first turn.',
    afterSetup(X) { for (const s of X.allShips()) s.touchPrev = X.touchingIslands(s); },
  },

  ceasefire: (rounds = 1) => ({
    label: `Ceasefire rnd ${rounds === 1 ? '1' : `1-${rounds}`}`,
    rule: `Nobody fires or boards in the first ${rounds === 1 ? 'round' : `${rounds} rounds`}.`,
    apply(X) {
      const quiet = () => roundOf(X) <= rounds;
      wrap(X.ACTIONS, 'fire', orig => (p, a) => { X.need(!quiet(), 'Hold your fire: the opening is a ceasefire.'); return orig(p, a); });
      wrap(X, 'aiBestShot', orig => (ship, opts) => (quiet() ? null : orig(ship, opts)));
      wrap(X, 'coinTargets', orig => (p, id) => (quiet() && id === 'boarding' ? [] : orig(p, id)));
    },
  }),

  dash: (rounds = 2, bonus = 2) => ({
    label: `Opening run +${bonus}×${rounds}`,
    rule: `Opening Run: for the first ${rounds} round${rounds > 1 ? 's' : ''}, every ship's Move Count is ${bonus} higher.`,
    apply(X) {
      wrap(X, 'beginTurn', orig => () => {
        const extra = roundOf(X) <= rounds ? bonus : 0;
        for (const s of X.G.players[X.G.active].ships) s.moveCount = X.FACTION_DEFS[s.build].moveCount + extra;
        orig();
      });
    },
  }),

  speed: (n = 1) => ({
    label: `Move Count +${n}`,
    rule: `Every fleet's Move Count goes up by ${n}.`,
    apply(X) { for (const f of Object.values(X.FACTION_DEFS)) f.moveCount += n; },
  }),

  winds: { label: 'Trade Winds', rule: 'The Trade Winds variant from the rulebook: +1 / -1 Move Count with and against the wind.', opts: { winds: true } },

  // Islands nearer or further from the edge than the rulebook's 12". With
  // max, every island also sits no more than max" in (a ring near the rim).
  isledge: (inches = 6, max = 0) => ({
    label: `Islands ${inches}${max ? `-${max}` : ''}" from edge`,
    rule: `Place islands at least ${inches}" from every table edge (instead of 12")${max ? `, and no more than ${max}" from the nearest edge` : ''}.`,
    apply(X) {
      X.islandEdgeMin = () => { const sz = X.tableSize(); return Math.min(inches * IN, Math.min(sz.w, sz.h) / 2 - 9); };
      if (max) wrap(X, 'islandSpotProblem', orig => (x, y, r) => orig(x, y, r) || (X.edgeDist(x, y) - r > max * IN ? 'Too far from the edge.' : null));
    },
  }),

  central: (inches = 20) => Object.assign(VARIANTS.isledge(inches), { rule: `Place islands at least ${inches}" from every table edge (instead of 12"), so they gather in the middle.` }),

  islands: (delta = -1) => ({
    label: `Islands ${delta > 0 ? '+' : ''}${delta}`,
    rule: `${Math.abs(delta)} ${delta < 0 ? 'fewer' : 'more'} island${Math.abs(delta) > 1 ? 's' : ''} than the setup table says.`,
    apply(X) { X.ISLANDS_FOR = Object.fromEntries(Object.entries(X.ISLANDS_FOR).map(([n, c]) => [n, Math.max(2, c + delta)])); },
  }),

  // The rulebook's table is 2 per player at 2-3 players, 1.5 at 4, 1.33 at 6.
  isleper: (per = 1) => ({
    label: `${per} island${per === 1 ? '' : 's'}/player`,
    rule: `Place ${per} island${per === 1 ? '' : 's'} per player, rounded, never fewer than 2 (2p: ${Math.max(2, Math.round(per * 2))}, 4p: ${Math.max(2, Math.round(per * 4))}, 6p: ${Math.max(2, Math.round(per * 6))}).`,
    apply(X) { X.ISLANDS_FOR = Object.fromEntries(Object.keys(X.ISLANDS_FOR).map(n => [n, Math.max(2, Math.round(per * n))])); },
  }),

  table: (id = 'round5') => ({ label: `Table ${id}`, rule: `Play on a ${id} table.`, table: id }),

  // ─── Give them a reason to cross ─────────────────────

  treasure: (bonus = 8) => ({
    label: `Treasure island +${bonus}`,
    rule: `The island nearest the middle of the table is the Treasure Island, set right in the middle. It scores ${8 + bonus} instead of 8.`,
    apply(X) {
      wrap(X, 'randomIslands', orig => () => {
        orig();
        const c = X.tableCenter(), isl = X.islands();
        if (!isl.length) return;
        const t = isl.slice().sort((a, b) => X.dist(a.x, a.y, c.x, c.y) - X.dist(b.x, b.y, c.x, c.y))[0];
        const others = isl.filter(o => o !== t);
        if (others.every(o => X.dist(c.x, c.y, o.x, o.y) - o.r - t.r >= X.ISLAND_GAP_MIN)) { t.x = c.x; t.y = c.y; }
        t.treasure = true;
      });
      addScore(X, p => bonus * X.islands().filter(t => t.treasure && t.owner === p).length);
      X.__simIslandValue = t => (t.treasure ? bonus * 1.25 : 0); // the planner's island worth is ~1.25 per point
    },
  }),

  bounty: (fitting = 6, hull = 12) => ({
    label: `Prizes ${fitting}/${hull}`,
    rule: `Prize fittings score ${fitting} (was 4) and prize hulls ${hull} (was 8).`,
    apply(X) { X.VP_PRIZE_FITTING = fitting; X.VP_PRIZE_HULL = hull; },
  }),

  firstblood: (bonus = 8) => ({
    label: `First blood +${bonus}`,
    rule: `The first fleet to knock a fitting off an enemy ship scores ${bonus} more points.`,
    apply(X) {
      wrap(X, 'applyHit', orig => (ship, by) => {
        const res = orig(ship, by);
        if (X.G.firstBlood == null && typeof by === 'number' && by !== ship.owner && HIT.includes(res)) X.G.firstBlood = by;
        return res;
      });
      addScore(X, p => (X.G.firstBlood === p ? bonus : 0));
    },
  }),

  clock: (rounds = 10) => ({
    label: `Game clock ${rounds} rnd`,
    rule: `The game ends after round ${rounds}. Score it; highest total wins.`,
    apply(X) {
      wrap(X, 'beginTurn', orig => () => {
        orig();
        if (X.G.phase === 'play' && roundOf(X) > rounds) X.endByScore(`Round ${rounds} is over.`);
      });
    },
  }),

  storm: (inches = 6, from = 3) => ({
    label: `Squall ${inches}" from rnd ${from}`,
    rule: `Squall Line: from round ${from}, a ship that ends its turn within ${inches}" of the table edge loses a fitting (nobody takes it as a prize; a dead ship sinks).`,
    apply(X) {
      const band = inches * IN;
      wrap(X, 'endTurnBookkeeping', orig => () => {
        if (roundOf(X) >= from) {
          for (const s of X.G.players[X.G.active].ships.slice()) {
            if (X.edgeGapOfSeg(X.shipSeg(s)) >= band) continue;
            if (s.fit > 0) X.loseFitting(s, X.nextToLose(s)); else X.sinkShip(s);
            X.ev({ e: 'storm', ship: s.id, msg: `${s.name} is battered by the squall.` });
          }
          X.checkLastFleet();
        }
        if (X.G.phase === 'play') orig();
      });
      // The computer keeps out of the squall from the round before it starts.
      wrap(X, 'aiEvalPose', orig => (ship, ps, goal) => {
        const sc = orig(ship, ps, goal);
        return roundOf(X) >= from - 1 && X.edgeGapOfSeg(X.shipSeg(ship, ps)) < band + 1 ? sc - 30 : sc;
      });
    },
  }),

  // ─── Faster action ───────────────────────────────────

  startcoins: (n = 2, coin = null) => ({
    label: coin ? `Start with ${n} ${coin}` : `Start with ${n} coins`,
    rule: coin ? `Each player starts with ${n} ${coin} coin${n > 1 ? 's' : ''}, taken from the bag.` : `Each player draws ${n} coin${n > 1 ? 's' : ''} from the bag before play begins.`,
    afterSetup(X) {
      for (const p of X.G.order) for (let k = 0; k < n; k++) {
        if (!coin) { X.drawCoin(p); continue; }
        const i = X.G.bag.indexOf(coin);
        if (i >= 0) { X.G.bag.splice(i, 1); X.G.players[p].coins[coin]++; }
      }
    },
  }),

  swingfire: (deg = 45) => ({
    label: `Swing ${deg}° and fire`,
    rule: `A ship that fires may first turn up to ${deg}° (it still may not Set Heading as well).`,
    apply(X) {
      const lim = deg * Math.PI / 180;
      const canSwing = s => X.canSteer(s) && !s.fullSail && !s.pending;
      // The fire action may carry turnTo: the heading to swing to before the shot.
      wrap(X.ACTIONS, 'fire', orig => (p, a) => {
        const s = X.shipById(a.ship);
        if (a.turnTo != null && a.source !== 'island' && s && s.owner === p && canSwing(s)) s.h = X.planRotate(s, X.normAngle(+a.turnTo), deg).h;
        return orig(p, a);
      });
      // The computer looks for shots across the swing, from the ship itself turned.
      wrap(X, 'aiBestShot', orig => (ship, opts) => {
        const best = orig(ship, opts);
        if (!canSwing(ship)) return best;
        let shipBest = best ? best.shipBest : null;
        const h0 = ship.h;
        for (const k of [-1, -0.5, 0.5, 1]) {
          const h = X.planRotate(ship, X.normAngle(h0 + k * lim), deg).h;
          if (Math.abs(X.angleDiff(h, h0)) < 0.05) continue;
          ship.h = h;
          let c;
          try { c = orig(ship, { noIsland: true }); } finally { ship.h = h0; }
          c = c && c.shipBest;
          if (c && (!shipBest || c.ev > shipBest.ev + 0.3)) shipBest = Object.assign(c, { turnTo: h });
        }
        if (!shipBest || shipBest === (best && best.shipBest)) return best;
        const out = !best || shipBest.ev > best.ev ? shipBest : best;
        out.shipBest = shipBest;
        return out;
      });
      wrap(X, 'aiFireAction', orig => (ship, shot) => {
        const a = orig(ship, shot);
        if (shot.turnTo != null && shot.source === 'ship') a.turnTo = shot.turnTo;
        return a;
      });
    },
  }),

  stalemate: { label: 'Stalemate rule', rule: 'The optional stalemate ending: every island held and none changed hands for two rounds.', opts: { stalemate: true } },
};

/** Variants run when --variants is not given: the baseline and one of each idea at its default. */
export const DEFAULT_SWEEP = ['baseline', 'deploy', 'dash', 'speed', 'winds', 'central', 'treasure', 'bounty', 'firstblood', 'clock', 'storm', 'startcoins:1:fullsail', 'swingfire'];

/**
 * Turn a key like 'deploy:18+dash' into one spec. Arguments that look like
 * numbers become numbers. Stacked variants merge in order: later opts and
 * table win, patches add up, apply and afterSetup run one after another.
 */
export function resolveVariant(key) {
  const parts = key.split('+').map(part => {
    const [id, ...args] = part.split(':');
    const def = VARIANTS[id];
    if (!def) throw new Error(`unknown variant "${id}" (have: ${Object.keys(VARIANTS).join(', ')})`);
    return typeof def === 'function' ? def(...args.map(a => (a !== '' && !isNaN(+a) ? +a : a))) : def;
  });
  if (parts.length === 1) return Object.assign({ key }, parts[0]);
  return {
    key,
    label: parts.map(s => s.label).join(' + '),
    rule: parts.map(s => s.rule).join(' '),
    opts: Object.assign({}, ...parts.map(s => s.opts || {})),
    table: parts.map(s => s.table).filter(Boolean).pop(),
    patch: parts.flatMap(s => s.patch || []),
    apply: X => parts.forEach(s => s.apply && s.apply(X)),
    afterSetup: X => parts.forEach(s => s.afterSetup && s.afterSetup(X)),
  };
}
