// What a shot does, for tuning the cannon model against the printed parts
// (MUZZLE_V, BOUNCE_*, SKID_*, SPREAD_MAX, SPIN_SD in constants.js): where
// each elevation first lands, how far it travels, how far off line it ends
// up and how much it has turned, over many rolls of the dice.
//
//   node scripts/cannon-stats.mjs
//   node scripts/cannon-stats.mjs --engine /tmp/variant.js --shots 8000
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const enginePath = args.includes('--engine') ? pathToFileURL(resolve(opt('--engine'))).href : new URL('../src/engine.gen.js', import.meta.url).href;
const { engine: E } = await import(enginePath);
const N = +opt('--shots', 4000);
// An empty table far larger than any shot, so nothing stops the ball.
E.G = { table: { shape: 'circle', r: 400 }, terrain: [], players: {}, order: [] };
E.setRand(E.seededRandom(1));
const pc = (a, f) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * f)].toFixed(1);
for (const elev of ['flat', 'lob']) {
  const p = E.shotPath(400, 400, E.aimedShot(0, elev));
  let apex = 0;
  for (let s = 0; s < p.total; s += 0.5) apex = Math.max(apex, E.pathAt(p, s).z);
  const tot = [], side30 = [], sideEnd = [], turn = [];
  for (let i = 0; i < N; i++) {
    const q = E.shotPath(400, 400, E.wobbleShot(0, elev));
    tot.push(q.total);
    if (q.total > 30) side30.push(Math.abs(E.pathAt(q, 30).x - 400));
    sideEnd.push(Math.abs(E.pathAt(q, q.total).x - 400));
    const L = q.legs.at(-1); turn.push(Math.abs(Math.atan2(L.fx, -L.fy)) * 180 / Math.PI);
  }
  console.log(`${elev === 'flat' ? 'Straight out' : 'Tipped up'}: first lands ${p.legs[0].s1.toFixed(1)} cm out, apex ${apex.toFixed(1)} cm`);
  console.log(`  travels ${pc(tot, 0.5)} cm (10th-90th percentile ${pc(tot, 0.1)}-${pc(tot, 0.9)})`);
  console.log(`  off line at 30 cm: median ${pc(side30, 0.5)} cm, 90th ${pc(side30, 0.9)} cm; where it stops: median ${pc(sideEnd, 0.5)} cm, 90th ${pc(sideEnd, 0.9)} cm`);
  console.log(`  heading turned by the stop: median ${pc(turn, 0.5)} deg, 90th ${pc(turn, 0.9)} deg`);
}
