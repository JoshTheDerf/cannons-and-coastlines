// One simulated game, and what it records about pacing.
//
// Rounds are counted the way balance.mjs counts them: seat 1's turn in
// round r is r.0, the next seat's r + 1/n, and so on, so "first hit 4.5"
// in a two-player game is the second player's turn in round 4.
import { styleSpec } from './styles.mjs';

// Rough seconds each thing takes at a real table, for the minutes columns.
// Guesses: tune them against a timed playtest and the minutes follow.
export const SECONDS = { turn: 15, move: 12, fire: 35, collect: 8, raise: 8, coin: 10, revive: 15, pass: 2, scuttle: 5 };
const HIT = ['fitting', 'dead', 'sunk'];
const ROUND_CAP = 40;

/** Seats apart round the table (1 = neighbours). */
const seatGap = (order, p, q) => { const n = order.length, d = Math.abs(order.indexOf(p) - order.indexOf(q)); return Math.min(d, n - d); };

export function playGame(X, spec, job) {
  X.setRand(X.seededRandom(job.seed));
  X.setAiEffort(job.effort === 'full' ? 'full' : 'lite');
  const opts = Object.assign({ stalemate: false }, spec.opts || {});
  X.newGame(Object.assign(opts, {
    seats: job.factions.map((f, i) => ({ faction: f, color: i, ai: true })),
    setup: 'quick', table: spec.table || job.table, seating: job.seating,
  }));
  const G = X.G;
  G.simStyle = Object.fromEntries(G.order.map((p, i) => [p, job.styles[i]]));
  G.aiStyle = Object.fromEntries(G.order.map((p, i) => [p, styleSpec(job.styles[i]).brain]));
  // Styles that game the setup go first (they deploy last, seeing everyone), then the variant's own setup.
  G.order.forEach((p, i) => { const st = styleSpec(job.styles[i]); if (st.deploy) st.deploy(X, p); });
  if (spec.afterSetup) spec.afterSetup(X);
  const startTouch = X.allShips().filter(s => X.touchingIslands(s).length).length;

  const n = G.order.length, rd = () => (G.turn - 1) / n + 1;
  const R = { firstContact: null, firstShot: null, firstHit: null, firstFlip: null, shots: 0, hits: 0, sinks: 0, captures: 0, flips: 0, raises: 0, storm: 0, leadChanges: 0, hitRounds: [], secs: 0, secsFirstHit: null, firstHitPair: null };
  const pairHits = {};
  // The opening: hits in round 1, hits on a fleet before its first turn, and
  // hits dealt and taken by each seat in the first two rounds.
  const O = { r1Hits: 0, preTurnHits: 0, earlyFlags: 0, dealt: G.order.map(() => 0), taken: G.order.map(() => 0) }, played = new Set();
  const landed = (p, q) => {
    const k = [p, q].sort().join('-');
    pairHits[k] = (pairHits[k] || 0) + 1;
    if (rd() < 2) O.r1Hits++;
    if (!played.has(q)) O.preTurnHits++;
    if (rd() < 3) { O.dealt[G.order.indexOf(p)]++; O.taken[G.order.indexOf(q)]++; }
  };
  const sec = k => { R.secs += SECONDS[k] || 0; };
  let leader = null, lastRound = 0, steps = 0;
  const range = X.RANGE_MAX;

  while (G.phase === 'play' && steps++ < 30000 && G.turn <= ROUND_CAP * n) {
    const p = G.active;
    // Once a round: has the leader changed? (Only a clear leader counts; ties don't.)
    if (Math.floor(rd()) !== lastRound) {
      lastRound = Math.floor(rd());
      const sc = X.scoreBreakdown(), top = Math.max(...G.order.map(q => sc[q].total)), lead = G.order.filter(q => sc[q].total === top);
      if (lead.length === 1 && top > 0) { if (leader != null && lead[0] !== leader) R.leadChanges++; leader = lead[0]; }
    }
    played.add(p);
    const owners = X.islands().map(t => t.owner);
    const a = X.aiNextAction(p);
    if (a.t === 'endTurn') sec('turn');
    const r = X.act(p, a);
    if (!r.ok) { X.act(p, { t: 'endTurn' }); continue; }
    sec(a.t);
    for (const e of r.events) {
      if (e.e === 'shot') {
        R.shots++;
        if (R.firstShot == null) R.firstShot = rd();
        if (HIT.includes(e.res)) {
          R.hits++; R.hitRounds.push(rd());
          if (e.res === 'sunk') R.sinks++;
          if (R.firstHit == null) { R.firstHit = rd(); R.secsFirstHit = R.secs; }
          landed(p, +String(e.target).match(/^p(\d+)/)[1]);
        }
      } else if (e.e === 'board' && HIT.includes(e.res)) {
        R.hits++; R.hitRounds.push(rd());
        if (R.firstHit == null) { R.firstHit = rd(); R.secsFirstHit = R.secs; }
        landed(p, X.shipById(e.ship)?.owner ?? +String(e.ship).match(/^p(\d+)/)[1]);
      } else if (e.e === 'capture') R.captures++;
      else if (e.e === 'flag') { R.raises++; if (rd() < 3) O.earlyFlags++; if (owners[X.islands().findIndex(t => t.id === e.island)] != null) { R.flips++; if (R.firstFlip == null) R.firstFlip = rd(); } }
      else if (e.e === 'storm') R.storm++;
    }
    // First contact: two enemy ships close enough that a shot could carry.
    if (R.firstContact == null) {
      const ships = X.allShips();
      outer: for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
        if (ships[i].owner !== ships[j].owner && X.dist(ships[i].x, ships[i].y, ships[j].x, ships[j].y) < range) { R.firstContact = rd(); break outer; }
      }
    }
  }

  const capped = G.phase === 'play';
  const sc = X.scoreBreakdown(), totals = G.order.map(q => sc[q].total).sort((a, b) => b - a);
  const rounds = G.turn / n;
  // Rounds with no hit at all, and the longest run of them.
  const hitR = new Set(R.hitRounds.map(Math.floor));
  let quiet = 0, run = 0, drought = 0;
  for (let k = 1; k <= Math.ceil(rounds); k++) { if (hitR.has(k)) run = 0; else { quiet++; run++; drought = Math.max(drought, run); } }
  // Pairs of seats that never met, by how far apart they sat.
  const pairs = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const p = G.order[i], q = G.order[j];
    pairs.push({ gap: seatGap(G.order, p, q), hits: pairHits[[p, q].sort().join('-')] || 0 });
  }
  const far = pairs.filter(x => x.gap >= 2);
  const reason = capped ? 'cap' : /declared/.test(G.endReason) ? 'declare' : /Last fleet/.test(G.endReason) ? 'last' : /Round \d+ is over/.test(G.endReason) ? 'clock' : /Stalemate/.test(G.endReason) ? 'stalemate' : 'other';
  return {
    scenario: job.scenario, variant: job.variant, g: job.g, seed: job.seed, factions: job.factions, styles: job.styles,
    winner: capped ? 0 : G.winner || 0, capped, reason, rounds,
    firstContact: R.firstContact, firstShot: R.firstShot, firstHit: R.firstHit, firstFlip: R.firstFlip,
    shots: R.shots, hits: R.hits, sinks: R.sinks, captures: R.captures, flips: R.flips, raises: R.raises, storm: R.storm,
    hitsFirstHalf: R.hitRounds.filter(t => t <= rounds / 2 + 1).length,
    quietRounds: quiet, drought, leadChanges: R.leadChanges,
    minutes: R.secs / 60, minutesFirstHit: R.secsFirstHit == null ? null : R.secsFirstHit / 60,
    margin: totals[0] - (totals[1] ?? 0),
    farPairs: far.length, farPairsMet: far.filter(x => x.hits).length,
    hitsFar: far.reduce((a, x) => a + x.hits, 0), hitsAll: pairs.reduce((a, x) => a + x.hits, 0),
    startTouch, r1Hits: O.r1Hits, preTurnHits: O.preTurnHits, earlyFlags: O.earlyFlags, earlyNet: O.dealt.map((d, i) => d - O.taken[i]),
  };
}
