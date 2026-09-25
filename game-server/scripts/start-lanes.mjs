// How exposed fleets are at the start: for every ship, every heading it can
// reach on its first turn (up to 90 degrees either way) and one click on,
// does any cannon lane (straight out or tipped up, aimed, no luck) reach a
// neighbouring fleet? This is what the flank rocks on round tables are for.
//
//   node scripts/start-lanes.mjs                     the engine as it is
//   node scripts/start-lanes.mjs --table fold8       another table
//   node scripts/start-lanes.mjs --engine /tmp/noflank.js --layout 9:10:2.6
//
// To try other rock layouts, build an engine without the flank rocks and add
// your own with --layout past:inward:radius[:second-row-inward], e.g.
//   node scripts/variant.mjs /tmp/noflank.js --replace "    if (n >= 3) flankRocks();" ""
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const enginePath = args.includes('--engine') ? pathToFileURL(resolve(opt('--engine'))).href : new URL('../src/engine.gen.js', import.meta.url).href;
const { engine: E } = await import(enginePath);
const table = opt('--table', 'round'), seeds = +opt('--seeds', 25), players = opt('--players', '3,4,5,6,7').split(',').map(Number);
const layout = opt('--layout', null);
const F = E.FACTION_ORDER, TAU = Math.PI * 2;

/** Extra rocks just past each end of every fleet's line (round tables). */
function addLayout(G) {
  const [past, inward, r, row2] = layout.split(':').map(Number);
  const R = G.table.r, c = { x: R, y: R }, n = G.order.length;
  for (const q of G.order) {
    const home = Math.PI / 2 + (q - 1) * TAU / n;
    const rel = G.players[q].ships.map(s => Math.atan2(Math.sin(Math.atan2(s.y - c.y, s.x - c.x) - home), Math.cos(Math.atan2(s.y - c.y, s.x - c.x) - home)));
    for (const [end, side] of [[Math.min(...rel), -1], [Math.max(...rel), 1]]) {
      const put = (off, inn) => { const a = home + end + side * off / R, rr = R - inn; G.terrain.push({ type: 'rock', x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, r, owner: null, id: G.terrain.length }); };
      put(past, inward);
      if (row2) put(past + 4, inward + row2);
    }
  }
}

console.log(`${table} table${layout ? `, extra rocks ${layout}` : ''}, ${seeds} layouts per player count`);
for (const n of players) {
  let ships = 0, exposed = 0, lanesOpen = 0, lanes = 0, overlap = 0;
  for (let k = 0; k < seeds; k++) {
    E.setRand(E.seededRandom(700 + k * 13 + n));
    E.newGame({ seats: Array.from({ length: n }, (_, i) => ({ faction: F[(k + i * 3) % 7], color: i, ai: true })), setup: 'quick', table });
    const G = E.G;
    if (layout && G.table.shape === 'circle') addLayout(G);
    for (const p of G.order) for (const s of G.players[p].ships) {
      for (const t of G.terrain) if (t.type === 'rock' && E.shipTouchesTerrain(s, t)) overlap++;
      const home = { x: s.x, y: s.y, h: s.h };
      let any = false;
      for (let d = -90; d <= 90; d += 15) {
        const h = home.h + d * Math.PI / 180;
        Object.assign(s, { x: home.x + Math.sin(h) * 4.5, y: home.y - Math.cos(h) * 4.5, h });
        E.shipSlots(s).forEach(sl => {
          const w = E.slotWorld(s, sl);
          const hs = sl.free ? E.enemyShipsOf(p).map(e => Math.atan2(e.x - w.x, -(e.y - w.y))) : [w.h];
          for (const hh of hs) for (const elev of ['flat', 'lob']) {
            lanes++;
            const tr = E.traceShot({ ship: s }, w.x, w.y, E.aimedShot(hh, elev));
            if (tr.kind === 'ship' && tr.obj.owner !== p) { lanesOpen++; any = true; }
          }
        });
      }
      Object.assign(s, home);
      ships++; if (any) exposed++;
    }
  }
  console.log(`  ${n} players: ${Math.round(100 * exposed / ships)}% of ships have a shot at another fleet after one turn (${(100 * lanesOpen / lanes).toFixed(1)}% of lanes)${overlap ? `, ${overlap} rock/ship overlaps` : ''}`);
}
