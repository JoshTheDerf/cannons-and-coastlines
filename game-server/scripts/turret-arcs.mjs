// The Industry turret's blind arcs, from the printed model: for each way
// the turret can point, fly the ball from its muzzle (the engine's launch
// speed and spread, both elevations) and see how often it hits the ship
// itself: the hull, the smokestack and the stern cargo. The turret is left
// out, since it turns with the gun.
//
//   node scripts/turret-arcs.mjs              arcs at 50% self-hits
//   node scripts/turret-arcs.mjs --table      the self-hit rate every 5 degrees
//
// Model frame (ship-assemblies.json): millimetres, keel at z = 0, bow
// toward -X, starboard +Y. Angles here are off the bow, + to starboard.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const assemblies = JSON.parse(readFileSync(ROOT + 'nuxt-site/shared/data/ship-assemblies.json', 'utf8'));
const src = readFileSync(ROOT + 'nuxt-site/public/game/constants.js', 'utf8');
const num = name => +src.match(new RegExp(`const ${name} = ([\\d.]+)`))[1];
// The engine's ball, in mm.
const BALL_R = num('BALL_R') * 10, MUZZLE_V = num('MUZZLE_V') * 10, MUZZLE_V_SD = num('MUZZLE_V_SD');
const MUZZLE_REACH = num('MUZZLE_REACH') * 10, MUZZLE_RISE = num('MUZZLE_RISE') * 10, G = 9810;
const SPREAD = 5 * Math.PI / 180, LOB = 30 * Math.PI / 180;

function readStl(path) {
  const b = readFileSync(path);
  const n = b.readUInt32LE(80), tris = [];
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12, t = [];
    for (let v = 0; v < 3; v++) t.push([b.readFloatLE(o + v * 12), b.readFloatLE(o + v * 12 + 4), b.readFloatLE(o + v * 12 + 8)]);
    tris.push(t);
  }
  return tris;
}
// A placed part: rotate about z by rotZ degrees around its anchor, then move the anchor to `at`.
const place = (tris, at, anchor = [0, 0, 0], rotZ = 0) => {
  const c = Math.cos(rotZ * Math.PI / 180), s = Math.sin(rotZ * Math.PI / 180);
  return tris.map(t => t.map(([x, y, z]) => { x -= anchor[0]; y -= anchor[1]; return [at[0] + x * c - y * s, at[1] + x * s + y * c, at[2] + z - anchor[2]]; }));
};

const ship = assemblies.ships.industry;
const tris = readStl(ROOT + ship.hull.source)
  .concat(...ship.fittings.filter(f => !f.name.includes('turret')).map(f => readStl(ROOT + f.source)))
  .concat(...ship.placements.filter(p => p.part === 'cargo').map(p => place(readStl(ROOT + assemblies.parts.cargo.source), p.at, assemblies.parts.cargo.anchor, p.rotZ || 0)));

// Height map: the top of the ship over each 0.5 mm cell.
const CELL = 0.5;
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const t of tris) for (const [x, y] of t) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const W = Math.ceil((x1 - x0) / CELL) + 1, H = Math.ceil((y1 - y0) / CELL) + 1;
const top = new Float32Array(W * H).fill(-Infinity);
for (const [a, b, c] of tris) {
  const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / CELL)), i1 = Math.min(W - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - x0) / CELL));
  const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1], c[1]) - y0) / CELL)), j1 = Math.min(H - 1, Math.ceil((Math.max(a[1], b[1], c[1]) - y0) / CELL));
  const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
    const px = x0 + i * CELL, py = y0 + j * CELL;
    let z;
    if (Math.abs(d) < 1e-9) z = Math.max(a[2], b[2], c[2]); // edge-on (a wall): its top
    else {
      const l1 = ((b[1] - c[1]) * (px - c[0]) + (c[0] - b[0]) * (py - c[1])) / d, l2 = ((c[1] - a[1]) * (px - c[0]) + (a[0] - c[0]) * (py - c[1])) / d, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      z = l1 * a[2] + l2 * b[2] + l3 * c[2];
    }
    if (z > top[i * H + j]) top[i * H + j] = z;
  }
}
const R = Math.ceil(BALL_R / CELL);
/** Does a ball centred at (x, y, z) touch the ship? */
function touches(x, y, z) {
  const ci = Math.round((x - x0) / CELL), cj = Math.round((y - y0) / CELL);
  for (let i = ci - R; i <= ci + R; i++) for (let j = cj - R; j <= cj + R; j++) {
    if (i < 0 || j < 0 || i >= W || j >= H) continue;
    const h = top[i * H + j];
    if (h === -Infinity) continue;
    const r2 = ((i - ci) * CELL) ** 2 + ((j - cj) * CELL) ** 2;
    if (r2 > BALL_R * BALL_R) continue;
    if (h >= z - Math.sqrt(BALL_R * BALL_R - r2)) return true;
  }
  return false;
}

const sock = ship.sockets.cannon.find(s => (s.where || '').startsWith('turret')).at;
/** Does a shot aimed `a` off the bow (radians, + starboard) hit the ship? */
function selfHit(a, elev, v) {
  const d = [-Math.cos(a), Math.sin(a)];
  const mx = sock[0] + d[0] * MUZZLE_REACH, my = sock[1] + d[1] * MUZZLE_REACH, mz = sock[2] + MUZZLE_RISE;
  const vh = v * Math.cos(elev), vz = v * Math.sin(elev);
  for (let s = 0; s <= 160; s += 0.5) {
    const t = s / vh, z = mz + vz * t - G * t * t / 2;
    if (z < BALL_R) break; // on the table: past the ship
    if (touches(mx + d[0] * s, my + d[1] * s, z)) return true;
  }
  return false;
}
/** Share of shots aimed `deg` off the bow that hit the ship (spread and spring as the engine rolls them). */
function hitRate(deg, elev) {
  let hits = 0, n = 0;
  for (let k = -10; k <= 10; k++) {
    const w = 11 - Math.abs(k); // straight ahead most likely
    const sp = SPREAD * k / 10;
    for (const f of [-1, 0, 1]) { hits += w * selfHit(deg * Math.PI / 180 + sp, elev, MUZZLE_V * (1 + f * MUZZLE_V_SD)); n += w; }
  }
  return hits / n;
}

const rows = [];
for (let deg = 0; deg <= 180; deg += 1) rows.push({ deg, flat: (hitRate(deg, 0) + hitRate(-deg, 0)) / 2, lob: (hitRate(deg, LOB) + hitRate(-deg, LOB)) / 2 });
if (process.argv.includes('--table')) {
  console.log('deg off bow   flat   lob   (share of shots that hit the ship, both sides averaged)');
  for (const r of rows.filter(r => r.deg % 5 === 0)) console.log(`${String(r.deg).padStart(5)}      ${(r.flat * 100).toFixed(0).padStart(4)}%  ${(r.lob * 100).toFixed(0).padStart(4)}%`);
}
const edge = (key, fromBow) => {
  const list = fromBow ? rows : rows.slice().reverse();
  const r = list.find(r => r[key] < 0.5);
  return r ? (fromBow ? r.deg : 180 - r.deg) : null;
};
console.log(`Turret muzzle ${(sock[2] + MUZZLE_RISE).toFixed(1)} mm up, ${(-sock[0]).toFixed(1)} mm toward the bow from the hull origin.`);
for (const key of ['flat', 'lob']) console.log(`${key === 'flat' ? 'Straight out' : 'Tipped up'}: blind ${edge(key, true)} deg either side of the bow, ${edge(key, false)} deg either side of the stern (half or more of shots hit the ship).`);
