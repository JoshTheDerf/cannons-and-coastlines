// Balance tests: seeded all-computer games across table sizes, checked
// against limits so a rules or AI change that tips a fleet (or brings back
// "park at an island and win on coins") shows up as a failure.
//
//   node scripts/balance.mjs            standard run (~5 min on 6 cores)
//   node scripts/balance.mjs --quick    fewer games, for a fast look
//   node scripts/balance.mjs --games 3  scale every scenario's game count
//   node scripts/balance.mjs --report   print the tables, never fail
//   node scripts/balance.mjs --tables   real table sizes instead: how soon the
//                                       fighting starts on each, and balance
//   node scripts/balance.mjs --only ffa4,styles   just those scenarios
//   node scripts/balance.mjs --engine /tmp/v.js   run a patched engine (see
//                                       scripts/variant.mjs) for an A/B test
//   node scripts/balance.mjs --logs [file.jsonl]
//                                       also print patterns from the action
//                                       logs, and save every game's log
//
// Win rates are shown as a multiple of a fair share (1.00 = wins as often
// as its seat count says it should). A limit only fails when the whole 95%
// interval sits outside it, so a check fails on a real lean, not on dice.
// Seeds are fixed: the same code gives the same numbers.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ─── Limits ───────────────────────────────────────────
// Each fleet's win rate must stay inside FLEET_LIMITS (x fair share);
// parking and fighting styles inside STYLE_LIMITS of each other.
const FLEET_LIMITS = [0.5, 1.8];
const STYLE_LIMITS = [0.7, 1.4];
const MAX_ROUND_CAP = 0.05;      // share of games allowed to run into the round cap
const ROUNDS = [4, 20];          // average game length, in rounds
// Known leans the rules have not fixed yet, with the side they lean to
// ('low' or 'high'). They are reported, not failed, but a lean the other
// way still fails. Remove an entry once that fleet is back inside limits.
const KNOWN = {
  'ffa4:treasure_fleet': ['low', 'Slow junks get swarmed at bigger tables.'],
  'ffa6:treasure_fleet': ['low', 'Slow junks get swarmed at bigger tables.'],
  'mixed4:treasure_fleet': ['low', 'Slow junks get swarmed at bigger tables.'],
  'ffa6:islanders': ['low', 'Five one-hit catamarans get picked off at a full table (0.3-0.5x).'],
};

// ─── Scenarios ────────────────────────────────────────
// duel: every ordered pair of fleets, so each meets each from both seats.
// ffa: distinct fleets per game, rotated so each sits in every seat.
// styles: turtle (parks and collects) against raider (hunts ships).
const SCENARIOS = [
  { id: 'duel-round', label: '2 players, online (6 ft round)', kind: 'duel', table: 'round', seeds: 6 },
  { id: 'duel-local', label: '2 players, local (6 ft folding)', kind: 'duel', table: 'fold6', seating: 'diagonal', seeds: 6 },
  { id: 'ffa3', label: '3 players (6 ft round)', kind: 'ffa', n: 3, games: 210 },
  { id: 'ffa4', label: '4 players (6 ft round)', kind: 'ffa', n: 4, games: 210 },
  { id: 'ffa6', label: '6 players (6 ft round)', kind: 'ffa', n: 6, games: 140 },
  { id: 'mixed4', label: '4 players, mixed computer styles', kind: 'ffa', n: 4, games: 140, styles: ['tactical', 'turtle', 'raider', 'plain'] },
  { id: 'styles', label: 'Parking (turtle) vs fighting (raider)', kind: 'styles', sizes: [2, 3, 4, 6], games: 60 },
  // Playing for coins: a banker (holds islands, collects, banks coins) at
  // tables with the other styles. It should win about its share too.
  { id: 'coins3', label: '3 players, playing for coins', kind: 'ffa', n: 3, games: 140, styles: ['banker', 'tactical', 'turtle', 'raider'], styleCheck: 'banker' },
  { id: 'coins4', label: '4 players, playing for coins', kind: 'ffa', n: 4, games: 140, styles: ['banker', 'tactical', 'turtle', 'raider'], styleCheck: 'banker' },
];

// Real tables (--tables): every two-player pairing on each table and
// seating, and free-for-alls on the tables big enough for them.
const TABLE_SCENARIOS = [
  ...[['round6', 'opposite'], ['round6', 'quarter'], ['fold6', 'sides'], ['fold6', 'diagonal'], ['fold6', 'ends'], ['fold8', 'sides'], ['fold8', 'diagonal'], ['fold8', 'ends']]
    .map(([table, seating]) => ({ id: `t2-${table}${seating ? '-' + seating : ''}`, label: `2p ${table}${seating ? ' ' + seating : ''}`, kind: 'duel', table, seating, seeds: 2 })),
  ...[3, 4, 6].flatMap(n => ['round6', 'fold6', 'fold8'].map(table => ({ id: `t${n}-${table}`, label: `${n}p ${table}`, kind: 'ffa', n, table, games: 70 }))),
];

// ─── One game ─────────────────────────────────────────
async function playGames({ jobs, enginePath }) {
  const { engine } = await import(enginePath);
  const out = [];
  for (const j of jobs) {
    engine.setRand(engine.seededRandom(j.seed));
    engine.setAiEffort('lite');
    engine.newGame({ seats: j.factions.map((f, i) => ({ faction: f, color: i, ai: true })), setup: 'quick', table: j.table, seating: j.seating, stalemate: false });
    const G = engine.G;
    G.aiStyle = Object.fromEntries(G.order.map((p, i) => [p, j.styles[i]]));
    let steps = 0, hits = 0, firstShot = 0;
    const hitTurns = [], leaderHits = { n: 0, lead: 0, share: 0 };
    const cap = 40 * j.factions.length; // 40 rounds: far past any real game
    // Action log: per-seat tallies of what every seat did, and (with --logs)
    // the move-by-move record [turn, seat, what, detail].
    const seat = () => ({ moves: 0, shots: { 'ship-flat': 0, 'ship-lob': 0, 'island-flat': 0, 'island-lob': 0 }, hits: { 'ship-flat': 0, 'ship-lob': 0, 'island-flat': 0, 'island-lob': 0 }, stopped: { brace: 0, stone: 0 }, collectTouch: 0, collectSea: 0, coinsGot: 0, collectsEmpty: 0, raised: 0, coins: {}, boards: 0, captures: 0, revives: 0, scuttles: 0, shipTurns: 0, parked: 0, hitDist: 0 });
    const tally = Object.fromEntries(G.order.map(p => [p, seat()]));
    const log = j.log ? [] : null;
    while (G.phase === 'play' && steps++ < 30000 && G.turn <= cap) {
      const p = G.active, T = tally[p];
      const a = engine.aiNextAction(p);
      if (a.t === 'endTurn') for (const s of G.players[p].ships) { T.shipTurns++; if (engine.touchingIslands(s).some(i => G.terrain[i].owner === p)) T.parked++; }
      const touching = a.t === 'collect' ? engine.touchingIslands(G.players[p].ships.find(s => s.id === a.ship)).includes(a.island) : false;
      const r = engine.act(p, a);
      if (!r.ok) { engine.act(p, { t: 'endTurn' }); continue; }
      if (a.t === 'move') T.moves++;
      else if (a.t === 'collect') touching ? T.collectTouch++ : T.collectSea++;
      else if (a.t === 'raise') T.raised++;
      else if (a.t === 'revive') T.revives++;
      else if (a.t === 'scuttle') T.scuttles++;
      else if (a.t === 'coin') T.coins[a.coin] = (T.coins[a.coin] || 0) + 1;
      for (const e of r.events) {
        if (e.e === 'shot') {
          if (!firstShot) firstShot = G.turn;
          if (['fitting', 'dead', 'sunk'].includes(e.res)) {
            hitTurns.push(G.turn);
            // Was the ship hit the current leader's? (Scores as they stood before this hit.)
            if (G.order.length >= 3) { const sc = engine.scoreBreakdown(), top = Math.max(...G.order.map(q => sc[q].total)); if (e.target != null) { const owner = +String(e.target).match(/^p(\d+)/)[1]; leaderHits.n++; if (sc[owner] && sc[owner].total === top) leaderHits.lead++; leaderHits.share += G.order.filter(q => sc[q].total === top).length / G.order.filter(q => engine.inGame(q)).length; } }
          }
          const k = `${a.source === 'island' ? 'island' : 'ship'}-${e.shot.elev}`;
          T.shots[k]++;
          if (['fitting', 'dead', 'sunk'].includes(e.res)) { T.hits[k]++; hits++; T.hitDist += e.stopS; }
          else if (e.res === 'brace' || e.res === 'stone') T.stopped[e.res]++;
          if (log) log.push([G.turn, p, 'shot', k, e.kind, e.res || '', Math.round(e.stopS)]);
        } else if (e.e === 'board') { T.boards++; if (['fitting', 'dead', 'sunk'].includes(e.res)) hits++; }
        else if (e.e === 'capture') T.captures++;
        else if (e.e === 'collect') { T.coinsGot += e.got.length; if (!e.got.length) T.collectsEmpty++; }
      }
      if (log && a.t !== 'fire') log.push([G.turn, p, a.t, a.coin || (a.t === 'collect' ? (touching ? 'touch' : 'sea') : '')]);
    }
    const capped = G.phase === 'play';
    const sc = engine.scoreBreakdown();
    const seats = G.order.map(p => Object.assign(tally[p], { faction: G.factions[p], style: G.aiStyle[p], won: !capped && G.winner === p, score: sc[p], shipsLeft: G.players[p].ships.length }));
    const n = j.factions.length, rd = t => (t - 1) / n + 1;
    out.push({ scenario: j.scenario, factions: j.factions, styles: j.styles, winner: capped ? 0 : G.winner || 0, rounds: G.turn / n, capped, hits, seats, log, seed: j.seed,
      firstShot: firstShot ? rd(firstShot) : null, firstHit: hitTurns.length ? rd(hitTurns[0]) : null, earlyHits: hitTurns.filter(t => rd(t) <= G.turn / n / 2).length, allHits: hitTurns.length, islands: engine.islands().length, leaderHits });
  }
  return out;
}

function makeJobs(scale, list = SCENARIOS) {
  const F = ['queens_fleet', 'corsairs', 'treasure_fleet', 'stone_fleet', 'shadow_fleet', 'industry', 'islanders'];
  const jobs = [];
  let seed = 1000;
  for (const sc of list) {
    if (sc.kind === 'duel') {
      const seeds = Math.max(1, Math.round(sc.seeds * scale));
      for (const a of F) for (const b of F) if (a !== b) for (let k = 0; k < seeds; k++) jobs.push({ scenario: sc.id, table: sc.table, seating: sc.seating, factions: [a, b], styles: ['tactical', 'tactical'], seed: seed++ });
    } else if (sc.kind === 'ffa') {
      const games = Math.max(7, Math.round(sc.games * scale));
      for (let g = 0; g < games; g++) {
        // A seeded Fisher-Yates shuffle picks distinct fleets; the seats then
        // rotate with the game number, so every fleet sits in every seat
        // equally often (seat 1 moves first, which matters).
        let r = (seed * 2654435761) >>> 0;
        const next = () => { r = (r + 0x6D2B79F5) >>> 0; let t = Math.imul(r ^ (r >>> 15), r | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const pool = F.slice();
        for (let i = pool.length - 1; i > 0; i--) { const k = Math.floor(next() * (i + 1)); [pool[i], pool[k]] = [pool[k], pool[i]]; }
        const pick = pool.slice(0, sc.n), turn = g % sc.n;
        const factions = pick.slice(turn).concat(pick.slice(0, turn));
        const styles = factions.map((_, i) => (sc.styles ? sc.styles[(g + i) % sc.styles.length] : 'tactical'));
        jobs.push({ scenario: sc.id, table: sc.table || 'round', factions, styles, seed: seed++ });
      }
    } else {
      for (const n of sc.sizes) {
        const games = Math.max(8, Math.round(sc.games * scale));
        for (let g = 0; g < games; g++) {
          const factions = Array.from({ length: n }, (_, i) => F[(g * 3 + i * 2) % 7]);
          const styles = factions.map((_, i) => ((g + i) % 2 ? 'raider' : 'turtle'));
          jobs.push({ scenario: `styles${n}`, table: 'round', factions, styles, seed: seed++ });
        }
      }
    }
  }
  return jobs;
}

// ─── Stats ────────────────────────────────────────────
/** Win share of `key` over seats it had, as a multiple of fair, with a 95% interval. */
function share(games, pick) {
  let wins = 0, seats = 0, fair = 0;
  for (const g of games) {
    const mine = g.factions.map((f, i) => pick(g, i)).filter(Boolean).length;
    if (!mine) continue;
    seats += mine; fair += mine / g.factions.length;
    if (g.winner && pick(g, g.winner - 1)) wins++;
  }
  const n = fair ? games.filter(g => g.factions.some((f, i) => pick(g, i))).length : 0;
  const p = n ? wins / n : 0, pf = n ? fair / n : 1;
  const se = n ? Math.sqrt(Math.max(p * (1 - p), 0.25 / n) / n) : 1;
  return { x: p / pf, lo: Math.max(0, (p - 1.96 * se) / pf), hi: (p + 1.96 * se) / pf, games: n };
}
const outside = (s, [lo, hi]) => s.hi < lo || s.lo > hi;
const fmt = s => s.x.toFixed(2).padStart(5);

// ─── Main ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const scale = args.includes('--quick') ? 0.35 : +(args[args.indexOf('--games') + 1] || 1) || 1;
  const report = args.includes('--report');
  const li = args.indexOf('--logs'), logFile = li >= 0 && args[li + 1] && !args[li + 1].startsWith('--') ? args[li + 1] : null;
  const tablesMode = args.includes('--tables');
  const oi = args.indexOf('--only'), only = oi >= 0 ? args[oi + 1].split(',') : null;
  const ei = args.indexOf('--engine'), enginePath = ei >= 0 ? pathToFileURL(resolve(args[ei + 1])).href : new URL('../src/engine.gen.js', import.meta.url).href;
  const list = (tablesMode ? TABLE_SCENARIOS : SCENARIOS).filter(sc => !only || only.includes(sc.id) || (sc.kind === 'styles' && only.includes('styles')));
  if (!list.some(sc => sc.kind === 'styles')) list.push({ id: 'styles', label: 'Parking (turtle) vs fighting (raider)', kind: 'styles', sizes: [], games: 0 });
  const jobs = makeJobs(scale, list).map(j => Object.assign(j, { log: !!logFile }));
  const ACTIVE = list;
  const nw = Math.max(1, Math.min(cpus().length, 8));
  const t0 = Date.now();
  // Deal the jobs out round-robin so every worker gets a mix of long and short games.
  const results = (await Promise.all(Array.from({ length: nw }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: jobs.filter((_, i) => i % nw === w), enginePath } });
    wk.on('message', res); wk.on('error', rej);
  })))).flat();
  const by = id => results.filter(g => g.scenario === id);
  if (tablesMode) { tableReport(results, by); return; }
  const F = ['queens_fleet', 'corsairs', 'treasure_fleet', 'stone_fleet', 'shadow_fleet', 'industry', 'islanders'];
  const NAME = { queens_fleet: "Queen's", corsairs: 'Corsairs', treasure_fleet: 'Treasure', stone_fleet: 'Stone', shadow_fleet: 'Shadow', industry: 'Industry', islanders: 'Islanders' };
  const fails = [], known = [];
  console.log(`${results.length} games in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${nw} workers. Win rate as a multiple of a fair share (1.00 = fair).\n`);
  console.log('Scenario'.padEnd(40) + F.map(f => NAME[f].padStart(10)).join('') + '   rounds  capped  hits');
  for (const sc of ACTIVE.filter(s => s.kind !== 'styles' && !s.styleCheck)) {
    const games = by(sc.id);
    const cells = F.map(f => {
      const s = share(games, (g, i) => g.factions[i] === f);
      let mark = ' ';
      const kn = KNOWN[`${sc.id}:${f}`], side = s.hi < FLEET_LIMITS[0] ? 'low' : 'high';
      if (outside(s, FLEET_LIMITS)) { if (kn && kn[0] === side) { mark = '~'; known.push(`${sc.label}: ${NAME[f]} ${s.x.toFixed(2)}x (known: ${kn[1]})`); } else { mark = '!'; fails.push(`${sc.label}: ${NAME[f]} wins ${s.x.toFixed(2)}x fair share (95% ${s.lo.toFixed(2)}-${s.hi.toFixed(2)}), limit ${FLEET_LIMITS.join('-')}`); } }
      return (fmt(s) + mark).padStart(10);
    }).join('');
    const rounds = games.reduce((a, g) => a + g.rounds, 0) / games.length, capped = games.filter(g => g.capped).length / games.length;
    const hits = games.reduce((a, g) => a + g.hits, 0) / games.length;
    if (capped > MAX_ROUND_CAP) fails.push(`${sc.label}: ${(capped * 100).toFixed(0)}% of games ran into the 40-round cap (limit ${MAX_ROUND_CAP * 100}%)`);
    if (rounds < ROUNDS[0] || rounds > ROUNDS[1]) fails.push(`${sc.label}: games average ${rounds.toFixed(1)} rounds (limit ${ROUNDS.join('-')})`);
    console.log(`${sc.label.padEnd(40)}${cells}   ${rounds.toFixed(1).padStart(6)}  ${(capped * 100).toFixed(0).padStart(5)}%  ${hits.toFixed(1).padStart(4)}`);
  }
  // Head to head, both seat orders, two-player games on both tables.
  const duels = results.filter(g => g.scenario.startsWith('duel'));
  console.log('\nHead to head, 2 players (row fleet\'s win rate against column fleet):');
  console.log(''.padEnd(12) + F.map(f => NAME[f].padStart(10)).join(''));
  for (const a of F) {
    console.log(NAME[a].padEnd(12) + F.map(b => {
      if (a === b) return '-'.padStart(10);
      const gs = duels.filter(g => g.factions.includes(a) && g.factions.includes(b));
      const w = gs.filter(g => g.winner && g.factions[g.winner - 1] === a).length;
      return `${Math.round(100 * w / gs.length)}%`.padStart(10);
    }).join(''));
  }
  // Parking against fighting.
  const sty = ACTIVE.find(s => s.kind === 'styles');
  console.log(`\n${sty.label}:`);
  for (const n of sty.sizes) {
    const games = by(`styles${n}`);
    const t = share(games, (g, i) => g.styles[i] === 'turtle'), r = share(games, (g, i) => g.styles[i] === 'raider');
    console.log(`  ${n} players: turtle ${t.x.toFixed(2)}, raider ${r.x.toFixed(2)} (${games.length} games)`);
    if (outside(t, STYLE_LIMITS)) fails.push(`${sty.label}, ${n} players: turtle wins ${t.x.toFixed(2)}x fair share (95% ${t.lo.toFixed(2)}-${t.hi.toFixed(2)}), limit ${STYLE_LIMITS.join('-')}`);
  }
  // Do the fleets go after whoever is winning? Hits on the leader against the leader's share of the fleets.
  const lh = results.reduce((a, g) => { a.n += g.leaderHits.n; a.lead += g.leaderHits.lead; a.share += g.leaderHits.share; return a; }, { n: 0, lead: 0, share: 0 });
  if (lh.n) console.log(`\nThree or more fleets: ${Math.round(100 * lh.lead / lh.n)}% of hits land on the current leader (fair share by numbers ${Math.round(100 * lh.share / lh.n)}%).`);
  const coinChecks = ACTIVE.filter(sc => sc.styleCheck);
  if (coinChecks.length) console.log('\nPlaying for coins (banker) against tactical, turtle and raider:');
  for (const sc of coinChecks) {
    const g = by(sc.id), bank = g.flatMap(x => x.seats.filter(s => s.style === sc.styleCheck));
    const row = ['banker', 'tactical', 'turtle', 'raider'].map(st => `${st} ${share(g, (x, i) => x.styles[i] === st).x.toFixed(2)}`).join(', ');
    const b = share(g, (x, i) => x.styles[i] === sc.styleCheck);
    console.log(`  ${sc.label}: ${row} (${g.length} games; the banker ends with ${(bank.reduce((a, s) => a + s.score.coins, 0) / Math.max(1, bank.length)).toFixed(1)} coins)`);
    if (outside(b, STYLE_LIMITS)) fails.push(`${sc.label}: the banker wins ${b.x.toFixed(2)}x fair share (95% ${b.lo.toFixed(2)}-${b.hi.toFixed(2)}), limit ${STYLE_LIMITS.join('-')}`);
  }
  if (li >= 0) patterns(results, NAME);
  if (logFile) { writeFileSync(logFile, results.map(g => JSON.stringify(g)).join('\n') + '\n'); console.log(`\nAction logs for ${results.length} games written to ${logFile}`); }
  if (known.length) console.log('\nKnown leans (reported, not failed):\n  ' + known.join('\n  '));
  // Which pairings stall: two-player games that hit the round cap.
  const stalls = {};
  for (const g of duels) if (g.capped) { const k = g.factions.map(f => NAME[f]).sort().join(' v '); stalls[k] = (stalls[k] || 0) + 1; }
  const st = Object.entries(stalls).sort((a, b) => b[1] - a[1]);
  if (st.length) console.log('\nTwo-player games that ran into the round cap, by pairing: ' + st.map(([k, v]) => `${k} ${v}`).join(', '));
  if (fails.length) console.log('\nFAIL\n  ' + fails.join('\n  '));
  else console.log('\nPASS: every fleet and style is inside its limits.');
  if (fails.length && !report) process.exitCode = 1;
}

// ─── Real tables ──────────────────────────────────────
function tableReport(results, by) {
  const med = a => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : NaN; };
  const F = ['queens_fleet', 'corsairs', 'treasure_fleet', 'stone_fleet', 'shadow_fleet', 'industry', 'islanders'];
  console.log(`${results.length} games on real tables. Rounds are whole turns of the table; "first hit" is how far into the game (by rounds) the first hit lands.\n`);
  console.log('Table'.padEnd(20) + 'islands  rounds  1st shot  1st hit  (of game)  hits in 1st half  capped  fleets (min-max x fair)');
  for (const sc of TABLE_SCENARIOS.filter(sc => by(sc.id).length)) {
    const g = by(sc.id);
    const frac = med(g.map(x => (x.firstHit != null ? x.firstHit / x.rounds : null)));
    const early = g.reduce((a, x) => a + x.earlyHits, 0) / Math.max(1, g.reduce((a, x) => a + x.allHits, 0));
    const fx = F.map(f => [f, share(g, (x, i) => x.factions[i] === f)]).filter(([, s]) => s.games).sort((a, b) => a[1].x - b[1].x);
    const xs = fx.map(([, s]) => s.x), SHORT = { queens_fleet: 'Queen', corsairs: 'Cors', treasure_fleet: 'Treas', stone_fleet: 'Stone', shadow_fleet: 'Shadow', industry: 'Indus', islanders: 'Isl' };
    console.log(`${sc.label.padEnd(20)}${(g.reduce((a, x) => a + x.islands, 0) / g.length).toFixed(1).padStart(7)}${(g.reduce((a, x) => a + x.rounds, 0) / g.length).toFixed(1).padStart(8)}${med(g.map(x => x.firstShot)).toFixed(1).padStart(10)}${med(g.map(x => x.firstHit)).toFixed(1).padStart(9)}${(Math.round(100 * frac) + '%').padStart(11)}${(Math.round(100 * early) + '%').padStart(18)}${(Math.round(100 * g.filter(x => x.capped).length / g.length) + '%').padStart(8)}   ${xs[0].toFixed(2)} ${SHORT[fx[0][0]]} .. ${xs.at(-1).toFixed(2)} ${SHORT[fx.at(-1)[0]]}`);
  }
}

// ─── Patterns from the action logs ────────────────────
function patterns(results, NAME) {
  const seats = results.flatMap(g => g.seats.map(s => Object.assign({ rounds: g.rounds, n: g.factions.length, capped: g.capped, scenario: g.scenario }, s)));
  const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
  const perRound = (arr, f) => sum(arr, f) / Math.max(1, sum(arr, s => s.rounds));
  const pct = (a, b) => (b ? `${Math.round(100 * a / b)}%` : '-');
  const shotsOf = s => sum(Object.keys(s.shots), k => s.shots[k]), hitsOf = s => sum(Object.keys(s.hits), k => s.hits[k]);
  const line = (label, arr) => {
    const coins = sum(arr, s => sum(Object.keys(s.coins), k => s.coins[k]));
    return `  ${label.padEnd(26)} shots/rnd ${perRound(arr, shotsOf).toFixed(2)}  hit ${pct(sum(arr, hitsOf), sum(arr, shotsOf)).padStart(4)}  parked ${pct(sum(arr, s => s.parked), sum(arr, s => s.shipTurns)).padStart(4)}  collect/rnd ${perRound(arr, s => s.collectTouch + s.collectSea).toFixed(2)} (${pct(sum(arr, s => s.collectSea), sum(arr, s => s.collectTouch + s.collectSea))} at sea)  flags/game ${(sum(arr, s => s.raised) / arr.length).toFixed(1)}  coins spent/rnd ${(coins / Math.max(1, sum(arr, s => s.rounds))).toFixed(2)}  coins left ${(sum(arr, s => s.score.coins) / arr.length).toFixed(1)}`;
  };
  console.log('\n═══ Patterns from the action logs ═══');
  console.log('\nShooting, by cannon and elevation:');
  for (const k of ['ship-flat', 'ship-lob', 'island-flat', 'island-lob']) {
    const n = sum(seats, s => s.shots[k]), h = sum(seats, s => s.hits[k]);
    console.log(`  ${k.padEnd(12)} ${String(n).padStart(6)} shots (${pct(n, sum(seats, shotsOf))} of all)  ${pct(h, n).padStart(4)} hit`);
  }
  console.log(`  hits land on average ${(sum(seats, s => s.hitDist) / Math.max(1, sum(seats, hitsOf))).toFixed(0)} cm from the muzzle. Stopped without damage: ${sum(seats, s => s.stopped.brace)} by Brace, ${sum(seats, s => s.stopped.stone)} by Stone Hulls`);
  console.log('\nWinners against everyone else (all scenarios):');
  console.log(line('winners', seats.filter(s => s.won)));
  console.log(line('the rest', seats.filter(s => !s.won)));
  const w = seats.filter(s => s.won);
  const part = k => sum(w, s => s.score[k]) / w.length;
  console.log(`  a winner's points, on average: islands ${(part('islands') * 8).toFixed(1)}, prize fittings ${(part('fittings') * 4).toFixed(1)}, prize hulls ${(part('hulls') * 8).toFixed(1)}, coins ${part('hoard').toFixed(1)}, bonuses ${part('bonus').toFixed(1)}`);
  const duel = seats.filter(s => s.scenario.startsWith('duel'));
  console.log('\nTwo-player games that stalled (hit the round cap) against those that finished:');
  console.log(line('stalled', duel.filter(s => s.capped)));
  console.log(line('finished', duel.filter(s => !s.capped)));
  const st = results.filter(g => g.capped && g.scenario.startsWith('duel'));
  if (st.length) {
    const sc = st.map(g => g.seats.map(s => s.score.total).sort((a, b) => b - a));
    console.log(`  stalled games end at ${(sum(sc, x => x[0]) / sc.length).toFixed(1)} to ${(sum(sc, x => x[1]) / sc.length).toFixed(1)} points, with ${(sum(st, g => g.hits) / st.length / 40).toFixed(2)} hits per round`);
  }
  console.log('\nBy fleet (all scenarios):');
  const F = Object.keys(NAME);
  for (const f of F) {
    const arr = seats.filter(s => s.faction === f), won = arr.filter(s => s.won);
    const extra = `  boards/game ${(sum(arr, s => s.boards) / arr.length).toFixed(2)}  captures ${sum(arr, s => s.captures)}  revives ${sum(arr, s => s.revives)}  ships left ${(sum(arr, s => s.shipsLeft) / arr.length).toFixed(1)}`;
    console.log(line(NAME[f], arr) + extra);
    if (won.length) console.log(`  ${''.padEnd(26)} wins by: islands ${(sum(won, s => s.score.islands * 8) / won.length).toFixed(1)}, fittings ${(sum(won, s => s.score.fittings * 4) / won.length).toFixed(1)}, hulls ${(sum(won, s => s.score.hulls * 8) / won.length).toFixed(1)}, coins ${(sum(won, s => s.score.hoard) / won.length).toFixed(1)}, bonus ${(sum(won, s => s.score.bonus) / won.length).toFixed(1)}  (${won.length} wins)`);
  }
  const cols = sum(seats, s => s.collectTouch + s.collectSea);
  console.log(`\nCollecting: ${(sum(seats, s => s.coinsGot) / Math.max(1, cols)).toFixed(2)} coins per collect; ${pct(sum(seats, s => s.collectsEmpty), cols)} of collects found the bag empty`);
  console.log('\nCoins spent, per 100 rounds played:');
  const ids = ['brace', 'fullsail', 'evasive', 'gunner', 'repair', 'boarding'];
  const rounds = sum(seats, s => s.rounds);
  console.log('  ' + ids.map(k => `${k} ${(100 * sum(seats, s => s.coins[k] || 0) / rounds).toFixed(1)}`).join(', '));
}

if (isMainThread) main();
else playGames(workerData).then(r => parentPort.postMessage(r));
