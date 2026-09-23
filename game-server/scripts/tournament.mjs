// Self-play tournament: every faction against every other, a few seeds.
// Each ordered pair plays with the first seat using the given AI style and
// the second using `plain`, so "tactical vs plain" is a head-to-head.
//   node scripts/tournament.mjs [seeds] [styleA] [styleB]
import { engine } from '../src/engine.gen.js';

export function tournament({ seeds = 1, styleA = 'tactical', styleB = 'plain', log = false, off = null } = {}) {
  const F = engine.FACTION_ORDER;
  const res = { games: 0, winsA: 0, winsB: 0, draws: 0, byA: {}, vsB: {}, islA: 0, islB: 0, turnsA: 0, turnsB: 0, p90: 0 };
  const times = [];
  for (const fa of F) for (const fb of F) {
    if (fa === fb) continue;
    for (let k = 0; k < seeds; k++) {
      engine.setRand(engine.seededRandom(7919 * (F.indexOf(fa) + 1) + 104729 * (F.indexOf(fb) + 1) + k * 31));
      engine.setAiEffort('lite');
      engine.newGame({ seats: [{ faction: fa, color: 0, ai: true }, { faction: fb, color: 1, ai: true }], setup: 'quick', table: 'round' });
      const G = engine.G;
      G.aiStyle = { 1: styleA, 2: styleB };
      if (off) G.aiOff = off;
      let steps = 0, lastTurn = -1;
      while (G.phase === 'play' && steps++ < 4000) {
        const p = G.active;
        if (G.turn !== lastTurn) { lastTurn = G.turn; const held = engine.islands().filter(t => t.owner === p).length; if (p === 1) { res.islA += held; res.turnsA++; } else { res.islB += held; res.turnsB++; } }
        const t0 = performance.now();
        const a = engine.aiNextAction(p);
        times.push(performance.now() - t0);
        const r = engine.act(p, a);
        if (!r.ok) engine.act(p, { t: 'endTurn' });
      }
      res.games++;
      const w = G.phase === 'over' ? G.winner : 0;
      if (w === 1) res.winsA++; else if (w === 2) res.winsB++; else res.draws++;
      (res.byA[fa] ||= [0, 0])[0] += w === 1; res.byA[fa][1]++;
      (res.vsB[fb] ||= [0, 0])[0] += w === 1; res.vsB[fb][1]++;
      if (log) console.log(fa, 'vs', fb, 'winner', w, G.turn, G.endReason);
    }
  }
  times.sort((x, y) => x - y);
  res.p90 = times[Math.floor(times.length * 0.9)];
  res.p50 = times[Math.floor(times.length * 0.5)];
  return res;
}

export function report(name, r) {
  const pct = ([w, n]) => `${Math.round(100 * w / n)}%`;
  console.log(`${name}: ${r.games} games. First seat wins ${r.winsA}, second ${r.winsB}, draws ${r.draws} (${Math.round(100 * r.winsA / r.games)}% first seat).`);
  console.log(`  islands held per turn: first seat ${(r.islA / r.turnsA).toFixed(2)}, second ${(r.islB / r.turnsB).toFixed(2)}. AI step p50 ${r.p50.toFixed(1)} ms, p90 ${r.p90.toFixed(1)} ms`);
  console.log('  first seat win rate by its fleet:  ' + Object.entries(r.byA).map(([f, v]) => `${f} ${pct(v)}`).join(', '));
  console.log('  first seat win rate by opponent:   ' + Object.entries(r.vsB).map(([f, v]) => `${f} ${pct(v)}`).join(', '));
}



/**
 * Multi-fleet tables with one Stone Fleet: how often it wins when every AI
 * uses `style` (plain = no ganging up, tactical = the others gang up).
 */
export function stoneTables({ n = 3, seeds = 6, style = 'tactical' } = {}) {
  const others = engine.FACTION_ORDER.filter(f => f !== 'stone_fleet');
  let stoneWins = 0, games = 0, stoneIsl = 0, turns = 0;
  for (let k = 0; k < seeds * others.length; k++) {
    engine.setRand(engine.seededRandom(55555 + n * 1000 + k));
    engine.setAiEffort('lite');
    const seats = [];
    const stoneAt = k % n;
    for (let i = 0; i < n; i++) seats.push({ faction: i === stoneAt ? 'stone_fleet' : others[(k + i) % others.length], color: i, ai: true });
    engine.newGame({ seats, setup: 'quick', table: 'round' });
    const G = engine.G;
    G.aiStyle = Object.fromEntries(G.order.map(p => [p, style]));
    let steps = 0, lastTurn = -1;
    const stone = stoneAt + 1;
    while (G.phase === 'play' && steps++ < 8000) {
      const p = G.active;
      if (p === stone && G.turn !== lastTurn) { lastTurn = G.turn; stoneIsl += engine.islands().filter(t => t.owner === stone).length; turns++; }
      const r = engine.act(p, engine.aiNextAction(p));
      if (!r.ok) engine.act(p, { t: 'endTurn' });
    }
    games++;
    if (G.winner === stone) stoneWins++;
  }
  return { games, stoneWins, rate: stoneWins / games, fair: 1 / n, isl: stoneIsl / turns };
}

export function reportStone(n, before, after) {
  console.log(`${n} fleets, one Stone Fleet: Stone wins ${Math.round(100 * before.rate)}% with plain AIs, ${Math.round(100 * after.rate)}% when the others gang up (fair share ${Math.round(100 / n)}%, ${after.games} games each). Stone islands/turn ${before.isl.toFixed(2)} -> ${after.isl.toFixed(2)}.`);
}

/** Head to head across both seat orders, plus the plain mirror as the "before". */
export function headToHead(seeds, style = 'tactical') {
  const base = tournament({ seeds, styleA: 'plain', styleB: 'plain' });
  const a = tournament({ seeds, styleA: style, styleB: 'plain' }), b = tournament({ seeds, styleA: 'plain', styleB: style });
  const w = a.winsA + b.winsB, n = a.games + b.games;
  const byOpp = {};
  for (const [f, [x, m]] of Object.entries(a.vsB)) byOpp[f] = [x, m];
  // In b the tactical seat is second: its opponents are b's first-seat fleets.
  for (const [f, [x, m]] of Object.entries(b.byA)) { byOpp[f][0] += m - x; byOpp[f][1] += m; }
  console.log(`before (plain vs plain): islands held per turn ${((base.islA + base.islB) / (base.turnsA + base.turnsB)).toFixed(2)} per AI`);
  console.log(`after: ${style} beats plain ${w}/${n} = ${Math.round(100 * w / n)}% (50% = no better). Islands held per turn: ${style} ${((a.islA + b.islB) / (a.turnsA + b.turnsB)).toFixed(2)}, plain ${((a.islB + b.islA) / (a.turnsB + b.turnsA)).toFixed(2)}. AI step p90 ${Math.max(a.p90, b.p90).toFixed(1)} ms`);
  console.log(`  ${style} win rate by opponent fleet: ` + Object.entries(byOpp).map(([f, [x, m]]) => `${f} ${Math.round(100 * x / m)}%`).join(', '));
  return { w, n };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = +(process.argv[2] || 2);
  headToHead(seeds);
  for (const n of [3, 4]) reportStone(n, stoneTables({ n, seeds: 2, style: 'plain' }), stoneTables({ n, seeds: 2, style: 'tactical' }));
}
