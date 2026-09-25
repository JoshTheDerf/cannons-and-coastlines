// Draw quick-start maps as an HTML page of SVGs: islands (sand), rocks
// (grey), reefs (pink) and each fleet in its colour, to eyeball setup
// changes such as table sizes, seating and flank rocks.
//
//   node scripts/map-preview.mjs /tmp/maps.html
//   node scripts/map-preview.mjs /tmp/maps.html --maps round6:6:3,fold8:4:1,fold6:2:5:diagonal
//
// Each map is table:players:seed[:seating].
import { writeFileSync } from 'node:fs';
import { engine as E } from '../src/engine.gen.js';

const args = process.argv.slice(2), out = args[0];
if (!out || out.startsWith('--')) { console.error('usage: node scripts/map-preview.mjs <out.html> [--maps table:players:seed[:seating],...]'); process.exit(1); }
const mi = args.indexOf('--maps');
const maps = (mi >= 0 ? args[mi + 1] : 'round6:2:1,round6:4:2,round6:6:3,fold6:2:4:diagonal,fold8:4:5,fold8:6:6').split(',');
const F = E.FACTION_ORDER, cols = E.PALETTE.map(p => p.main);
const svgs = maps.map(spec => {
  const [table, n, seed, seating] = spec.split(':');
  E.setRand(E.seededRandom(+seed));
  E.newGame({ seats: Array.from({ length: +n }, (_, i) => ({ faction: F[(i + +seed) % 7], color: i })), setup: 'quick', table, seating });
  const G = E.G, W = G.table.shape === 'circle' ? 2 * G.table.r : G.table.w, H = G.table.shape === 'circle' ? 2 * G.table.r : G.table.h;
  let s = `<figure><svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(W * 2.4)}" height="${Math.round(H * 2.4)}" viewBox="0 0 ${W} ${H}">`;
  s += G.table.shape === 'circle' ? `<circle cx="${G.table.r}" cy="${G.table.r}" r="${G.table.r}" fill="#1d4f7a"/>` : `<rect width="${W}" height="${H}" fill="#1d4f7a"/>`;
  for (const t of G.terrain) s += `<circle cx="${t.x}" cy="${t.y}" r="${t.r}" fill="${t.type === 'island' ? '#d8c28a' : t.type === 'rock' ? '#777' : '#c77'}" stroke="#222" stroke-width="0.4"/>`;
  for (const p of G.order) for (const sh of G.players[p].ships) {
    const f = { x: Math.sin(sh.h), y: -Math.cos(sh.h) }, hl = (sh.len - sh.wid) / 2;
    s += `<line x1="${sh.x - f.x * hl}" y1="${sh.y - f.y * hl}" x2="${sh.x + f.x * hl}" y2="${sh.y + f.y * hl}" stroke="${cols[p - 1]}" stroke-width="${sh.wid}" stroke-linecap="round"/>`;
  }
  return s + `</svg><figcaption>${table}, ${n} players, seed ${seed}${seating ? ', ' + seating : ''}: ${E.islands().length} islands</figcaption></figure>`;
});
writeFileSync(out, `<!doctype html><meta charset="utf-8"><title>Map preview</title><body style="margin:0;padding:12px;background:#222;color:#ddd;font:14px sans-serif;display:flex;flex-wrap:wrap;gap:16px;align-items:flex-start">${svgs.join('')}</body>`);
console.log(`wrote ${maps.length} maps to ${out}`);
