// Pacing simulator: play rule variants and playstyles against the computer
// on real tables, and compare how soon the fighting starts and how much of
// the game is spent waiting for it.
//
//   node sim/run.mjs                         every idea in DEFAULT_SWEEP on the default tables
//   node sim/run.mjs --variants baseline,deploy:18,deploy+dash
//   node sim/run.mjs --scenarios duel-opposite,ffa4 --games 168
//   node sim/run.mjs --vs raider             one seat plays raider, the rest the computer:
//                                            does charging in pay under each variant?
//   node sim/run.mjs --fleets base           Queen's Fleet and Corsairs only (the base game)
//   node sim/run.mjs --quick                 a third of the games, for a fast look
//   node sim/run.mjs --json /tmp/run.json    also save every game's record
//   node sim/run.mjs --focus opening         the first rounds instead: hits before a fleet's
//                                            first turn, islands touched at the start (setup rules)
//   node sim/run.mjs --from /tmp/run.json    report a saved run again (with --focus, say)
//   node sim/run.mjs --list                  variants, styles and scenarios
//
// Variants live in sim/variants.mjs, styles in sim/styles.mjs, tables in
// sim/scenarios.mjs. Every variant plays the same seeded games, so a
// difference is the rules, not the draw; a * marks a change from the
// baseline that is outside the noise (paired, 95%).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFileSync, readFileSync } from 'node:fs';
import { buildEngine } from './engine.mjs';
import { VARIANTS, DEFAULT_SWEEP, resolveVariant } from './variants.mjs';
import { STYLES } from './styles.mjs';
import { SCENARIOS, DEFAULT_SCENARIOS, FLEETS, FLEET_SETS, SHORT, lineup } from './scenarios.mjs';
import { playGame } from './play.mjs';

// ─── Worker: play a share of the games ────────────────
async function work({ jobs, engines }) {
  const loaded = {};
  for (const job of jobs) {
    let E = loaded[job.variant];
    if (!E) {
      // A fresh engine instance per variant, with the variant and every style applied once.
      const { X } = await import(`${pathToFileURL(engines[job.variant]).href}?v=${encodeURIComponent(job.variant)}`);
      const spec = resolveVariant(job.variant);
      if (spec.apply) spec.apply(X);
      for (const st of Object.values(STYLES)) if (st.apply) st.apply(X);
      E = loaded[job.variant] = { X, spec };
    }
    parentPort.postMessage({ game: playGame(E.X, E.spec, job) });
  }
  parentPort.postMessage({ done: true });
}

// ─── Stats ────────────────────────────────────────────
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
/** Paired difference of a metric between a variant and the baseline, over the games both played. */
function paired(games, base, get) {
  const b = new Map(base.map(g => [`${g.scenario}:${g.g}`, get(g)]));
  const d = games.map(g => get(g) - b.get(`${g.scenario}:${g.g}`)).filter(x => Number.isFinite(x));
  if (d.length < 3) return null;
  const m = mean(d), sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / (d.length - 1));
  return { d: m, sig: Math.abs(m) > 1.96 * sd / Math.sqrt(d.length) };
}
/** Win share of the seats `pick` chooses, as a multiple of a fair share, with a 95% interval. */
function share(games, pick) {
  let wins = 0, fair = 0, n = 0;
  for (const g of games) {
    const mine = g.factions.filter((_, i) => pick(g, i)).length;
    if (!mine) continue;
    n++; fair += mine / g.factions.length;
    if (g.winner && pick(g, g.winner - 1)) wins++;
  }
  if (!n) return null;
  const p = wins / n, pf = fair / n, se = Math.sqrt(Math.max(p * (1 - p), 0.25 / n) / n);
  return { x: p / pf, lo: Math.max(0, (p - 1.96 * se) / pf), hi: (p + 1.96 * se) / pf };
}

// What each column measures. A game with no hit counts its whole length
// as the wait for the first one.
const COLS = [
  { head: 'rounds', get: g => g.rounds, f: 1 },
  { head: 'in range', get: g => g.firstContact ?? g.rounds, f: 1 },
  { head: '1st hit', get: g => g.firstHit ?? g.rounds, f: 1 },
  { head: '1st hit %', get: g => (g.firstHit ?? g.rounds) / g.rounds * 100, f: 0 },
  { head: 'hit min', get: g => g.minutesFirstHit ?? g.minutes, f: 0 },
  { head: 'hits/rnd', get: g => g.hits / g.rounds, f: 2 },
  { head: 'quiet %', get: g => g.quietRounds / Math.ceil(g.rounds) * 100, f: 0 },
  { head: 'drought', get: g => g.drought, f: 1 },
  { head: 'flips', get: g => g.flips, f: 1 },
  { head: 'lead chg', get: g => g.leadChanges, f: 1 },
  { head: 'minutes', get: g => g.minutes, f: 0 },
];
// --focus opening: the first rounds, for setup rules that might be gamed.
const OPEN_COLS = [
  { head: 'rounds', get: g => g.rounds, f: 1 },
  { head: 'in range', get: g => g.firstContact ?? g.rounds, f: 1 },
  { head: '1st hit', get: g => g.firstHit ?? g.rounds, f: 1 },
  { head: 'rnd 1 hits', get: g => g.r1Hits, f: 2 },
  { head: 'pre-turn', get: g => g.preTurnHits, f: 2 },
  { head: 'start isl', get: g => g.startTouch, f: 2 },
  { head: 'flags r1-2', get: g => g.earlyFlags, f: 2 },
  { head: 'quiet %', get: g => g.quietRounds / Math.ceil(g.rounds) * 100, f: 0 },
  { head: 'minutes', get: g => g.minutes, f: 0 },
];
const FAR_COLS = [
  { head: 'far met %', get: g => (g.farPairs ? g.farPairsMet / g.farPairs * 100 : NaN), f: 0 },
  { head: 'far hits %', get: g => (g.hitsAll ? g.hitsFar / g.hitsAll * 100 : NaN), f: 0 },
];

function report(results, variants, scenarios, vs, focus) {
  const W = 12;
  const cell = (v, d, f) => {
    if (!Number.isFinite(v)) return '-'.padStart(W);
    const s = v.toFixed(f);
    if (!d) return s.padStart(W);
    const ds = (d.d >= 0 ? '+' : '') + d.d.toFixed(f) + (d.sig ? '*' : ' ');
    return `${s} ${ds}`.padStart(W);
  };
  for (const sk of scenarios) {
    const sc = SCENARIOS[sk], cols = focus === 'opening' ? OPEN_COLS : sc.n >= 4 ? COLS.concat(FAR_COLS) : COLS;
    const base = results.filter(g => g.scenario === sk && g.variant === variants[0]);
    console.log(`\n═══ ${sc.label}: ${base.length} games per variant${vs ? `, one seat plays ${vs}` : ''} ═══`);
    console.log('Variant'.padEnd(26) + cols.map(c => c.head.padStart(W)).join('') + '  seat 1'.padStart(9) + '  capped' + '  fleets (x fair)' + (vs ? `   ${vs} (x fair)  early net` : ''));
    for (const vk of variants) {
      const games = results.filter(g => g.scenario === sk && g.variant === vk);
      if (!games.length) continue;
      const first = vk === variants[0];
      const row = cols.map(c => cell(mean(games.map(c.get).filter(Number.isFinite)), first ? null : paired(games, base, c.get), c.f)).join('');
      const s1 = share(games, (g, i) => i === 0);
      const fl = FLEETS.map(f => [f, share(games, (g, i) => g.factions[i] === f)]).filter(([, s]) => s).sort((a, b) => a[1].x - b[1].x);
      const spread = fl.length > 1 ? `${fl[0][1].x.toFixed(2)} ${SHORT[fl[0][0]]}..${fl.at(-1)[1].x.toFixed(2)} ${SHORT[fl.at(-1)[0]]}` : '-';
      const capped = games.filter(g => g.capped).length / games.length;
      let ch = '';
      if (vs) {
        const s = share(games, (g, i) => g.styles[i] === vs);
        // Hits the challenger dealt minus hits it took in the first two rounds.
        const net = mean(games.map(g => g.earlyNet[g.styles.indexOf(vs)]));
        ch = s ? `   ${s.x.toFixed(2)} (${s.lo.toFixed(2)}-${s.hi.toFixed(2)})  ${(net >= 0 ? '+' : '') + net.toFixed(2)}`.padEnd(30) : '';
      }
      const label = resolveVariant(vk).label;
      console.log(label.slice(0, 25).padEnd(26) + row + `${Math.round(100 * s1.x / sc.n)}%`.padStart(9) + `${Math.round(100 * capped)}%`.padStart(8) + '  ' + spread.padEnd(16) + ch);
    }
  }
  console.log(`
Columns: rounds = game length. in range = first round two enemy ships are within ${55} cm (gun range).
1st hit = round of the first hit (1st hit % = how far into the game). hit min = estimated table minutes
to the first hit (SECONDS in play.mjs). hits/rnd = hits per round. quiet % = rounds with no hit.
drought = longest run of rounds with no hit. flips = islands taken from another fleet. lead chg = times
the clear leader changed. far met % / far hits % (4+ players) = seat pairs not side by side that ever
traded hits / share of all hits between them. seat 1 = first player's wins (fair is ${'1/n'}).
fleets = lowest and highest fleet win rate as a multiple of fair. With --vs, early net = hits the challenger
dealt minus took in rounds 1-2. --focus opening: rnd 1 hits = hits in round 1; pre-turn = hits on a fleet
before its first turn; start isl = ships touching an island at the start; flags r1-2 = flags raised in
rounds 1-2. Deltas are against ${resolveVariant(variants[0]).label}; * = outside the noise.`);
  console.log('\nVariants:');
  for (const vk of variants) { const s = resolveVariant(vk); console.log(`  ${vk.padEnd(24)} ${s.rule}`); }
}

// ─── Main ─────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
  if (args.includes('--list')) {
    console.log('Variants (name:arg:arg, stack with +):');
    for (const [k, v] of Object.entries(VARIANTS)) { const s = typeof v === 'function' ? v() : v; console.log(`  ${(typeof v === 'function' ? `${k}:…` : k).padEnd(14)} ${s.rule}`); }
    console.log('\nStyles (--vs):');
    for (const [k, v] of Object.entries(STYLES)) console.log(`  ${k.padEnd(14)} ${v.label}`);
    console.log('\nScenarios (--scenarios):');
    for (const [k, v] of Object.entries(SCENARIOS)) console.log(`  ${k.padEnd(16)} ${v.label}`);
    return;
  }
  const from = opt('--from', null);
  if (from) {
    const saved = JSON.parse(readFileSync(from, 'utf8'));
    report(saved.games, saved.variants, saved.scenarios, saved.vs, opt('--focus', null));
    return;
  }
  const variants = opt('--variants', DEFAULT_SWEEP.join(',')).split(',');
  if (variants[0] !== 'baseline' && !args.includes('--no-baseline')) variants.unshift('baseline');
  const scenarios = opt('--scenarios', DEFAULT_SCENARIOS.join(',')).split(',');
  for (const s of scenarios) if (!SCENARIOS[s]) throw new Error(`unknown scenario "${s}" (have: ${Object.keys(SCENARIOS).join(', ')})`);
  const vs = opt('--vs', null);
  if (vs && !STYLES[vs]) throw new Error(`unknown style "${vs}" (have: ${Object.keys(STYLES).join(', ')})`);
  const fl = opt('--fleets', 'all'), pool = FLEET_SETS[fl] || fl.split(',');
  for (const f of pool) if (!FLEETS.includes(f)) throw new Error(`unknown fleet "${f}"`);
  const games = +opt('--games', args.includes('--quick') ? 28 : 84);
  const effort = opt('--effort', 'lite');

  // One engine file per distinct set of source patches.
  const engines = {};
  for (const vk of variants) { const s = resolveVariant(vk); engines[vk] = buildEngine(s.patch || [], vk); }
  const jobs = [];
  scenarios.forEach((sk, si) => {
    const sc = SCENARIOS[sk];
    for (let g = 0; g < games; g++) {
      const { factions, styles } = lineup(sc, g, pool, vs);
      for (const variant of variants) jobs.push({ scenario: sk, variant, g, seed: 1e6 + si * 1e4 + g, factions, styles, table: sc.table, seating: sc.seating, effort });
    }
  });

  const nw = Math.max(1, Math.min(+opt('--workers', cpus().length), jobs.length));
  const t0 = Date.now(), results = [];
  let last = 0;
  await Promise.all(Array.from({ length: nw }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { jobs: jobs.filter((_, i) => i % nw === w), engines } });
    wk.on('message', m => {
      if (m.done) return res();
      results.push(m.game);
      const pct = Math.floor(100 * results.length / jobs.length);
      if (process.stderr.isTTY && pct !== last) { last = pct; process.stderr.write(`\r  ${results.length}/${jobs.length} games (${pct}%)`); }
    });
    wk.on('error', rej);
  })));
  if (process.stderr.isTTY) process.stderr.write('\r'.padEnd(40) + '\r');
  console.log(`${results.length} games in ${((Date.now() - t0) / 1000).toFixed(0)} s on ${nw} workers (fleets: ${fl}, effort: ${effort}).`);
  report(results, variants, scenarios, vs, opt('--focus', null));
  const jf = opt('--json', null);
  if (jf) { writeFileSync(jf, JSON.stringify({ args, variants, scenarios, vs, games: results })); console.log(`\nEvery game's record written to ${jf}`); }
}

if (isMainThread) main().catch(e => { console.error(e.message || e); process.exitCode = 1; });
else work(workerData);
