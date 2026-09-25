// Cannons & Coastlines, digital edition: geometry.js
// Ship footprints, contact tests, movement sweeps and cannonball traces.
// Pure functions over the game state G (no drawing here).

// A ship's footprint is a capsule: a segment along the keel with a radius of
// half the beam. Good enough for contact on a table with rounded hulls.
function shipSeg(ship, pose) {
  const p = pose || ship;
  const half = Math.max(0, (ship.len - ship.wid) / 2);
  const f = fwdVec(p.h);
  return { ax: p.x + f.x * half, ay: p.y + f.y * half, bx: p.x - f.x * half, by: p.y - f.y * half, r: ship.wid / 2 };
}

function ptSegDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function segSegDist(a, b) {
  // Closest distance between segments a (ax..bx) and b; checks for crossing first.
  if (segsCross(a.ax, a.ay, a.bx, a.by, b.ax, b.ay, b.bx, b.by)) return 0;
  return Math.min(
    ptSegDist(a.ax, a.ay, b.ax, b.ay, b.bx, b.by),
    ptSegDist(a.bx, a.by, b.ax, b.ay, b.bx, b.by),
    ptSegDist(b.ax, b.ay, a.ax, a.ay, a.bx, a.by),
    ptSegDist(b.bx, b.by, a.ax, a.ay, a.bx, a.by),
  );
}

function segsCross(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (Math.abs(d) < 1e-12) return false;
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// ─── Table shape ──────────────────────────────────────
// G.table = { shape: 'rect', w, h } or { shape: 'circle', r } (centre at r, r).
function tableCenter() { const t = G.table; return t.shape === 'circle' ? { x: t.r, y: t.r } : { x: t.w / 2, y: t.h / 2 }; }
function tableSize() { const t = G.table; return t.shape === 'circle' ? { w: 2 * t.r, h: 2 * t.r } : { w: t.w, h: t.h }; }
function onTable(x, y) {
  const t = G.table;
  if (t.shape === 'circle') return (x - t.r) ** 2 + (y - t.r) ** 2 <= t.r * t.r;
  return x >= 0 && y >= 0 && x <= t.w && y <= t.h;
}
/** Distance from a point inside the table to its edge (negative outside). */
function edgeDist(x, y) {
  const t = G.table;
  if (t.shape === 'circle') return t.r - Math.hypot(x - t.r, y - t.r);
  return Math.min(x, y, t.w - x, t.h - y);
}

function edgeGapOfSeg(s) {
  return Math.min(edgeDist(s.ax, s.ay), edgeDist(s.bx, s.by)) - s.r;
}

function allShips() {
  const out = [];
  for (const p of G.order) for (const s of G.players[p].ships) if (s.placed) out.push(s);
  return out;
}

/**
 * Things within `reach` of (x, y) that a ship could bump into: a short list
 * so movement sweeps do not test the whole table at every step.
 */
function nearbyObstacles(ship, x, y, reach) {
  const ships = [], terrain = [];
  for (const o of allShips()) if (o !== ship && dist(x, y, o.x, o.y) < reach + o.len / 2) ships.push(o);
  for (const t of G.terrain) if (dist(x, y, t.x, t.y) < reach + t.r) terrain.push(t);
  return { ships, terrain };
}

/** Smallest gap from `ship` at `pose` to anything else on the table. */
function poseGap(ship, pose, near) {
  const s = shipSeg(ship, pose);
  let best = { gap: Infinity, kind: null, obj: null };
  const eg = edgeGapOfSeg(s);
  if (eg < best.gap) best = { gap: eg, kind: 'edge', obj: null };
  for (const o of near ? near.ships : allShips()) {
    if (o === ship) continue;
    const g = segSegDist(s, shipSeg(o)) - s.r - o.wid / 2;
    if (g < best.gap) best = { gap: g, kind: 'ship', obj: o };
  }
  for (const t of near ? near.terrain : G.terrain) {
    const g = ptSegDist(t.x, t.y, s.ax, s.ay, s.bx, s.by) - s.r - t.r;
    if (g < best.gap) best = { gap: g, kind: t.type === 'island' ? 'island' : 'terrain', obj: t };
  }
  return best;
}

function shipsTouching(a, b) {
  return segSegDist(shipSeg(a), shipSeg(b)) - a.wid / 2 - b.wid / 2 <= TOUCH_TOL;
}

function shipTouchesTerrain(ship, t, pose) {
  const s = shipSeg(ship, pose);
  return ptSegDist(t.x, t.y, s.ax, s.ay, s.bx, s.by) - s.r - t.r <= TOUCH_TOL;
}

/** Water between the ship and the island's shore (0 when touching). */
function shoreGap(ship, t, pose) {
  const s = shipSeg(ship, pose);
  return Math.max(0, ptSegDist(t.x, t.y, s.ax, s.ay, s.bx, s.by) - s.r - t.r);
}

/** Indices of islands this ship is touching. */
function touchingIslands(ship, pose) {
  const out = [];
  G.terrain.forEach((t, i) => { if (t.type === 'island' && shipTouchesTerrain(ship, t, pose)) out.push(i); });
  return out;
}

/**
 * Set Heading: rotate in place toward `target`, limited to the ship's pivot
 * arc. Rotation stops early if the hull would swing into something.
 */
function planRotate(ship, target, pivotDeg) {
  const lim = pivotDeg * Math.PI / 180;
  let delta = angleDiff(target, ship.h);
  delta = clamp(delta, -lim, lim);
  const near = nearbyObstacles(ship, ship.x, ship.y, ship.len / 2 + 2);
  const tryDir = d => {
    const steps = Math.max(1, Math.ceil(Math.abs(d) / (3 * Math.PI / 180)));
    let prev = poseGap(ship, ship, near).gap, last = ship.h;
    for (let i = 1; i <= steps; i++) {
      const hh = ship.h + d * i / steps;
      const g = poseGap(ship, { x: ship.x, y: ship.y, h: hh }, near).gap;
      if (g < -COLLIDE_EPS && g < prev - 1e-4) return { h: normAngle(last), blocked: true, turned: Math.abs(d * (i - 1) / steps) };
      prev = g; last = hh;
    }
    return { h: normAngle(ship.h + d), blocked: false, turned: Math.abs(d) };
  };
  let r = tryDir(delta);
  // A 180 degree pivot can go either way round; try the other way if blocked.
  if (r.blocked && Math.abs(delta) > 1e-3) {
    const alt = delta > 0 ? delta - TAU : delta + TAU;
    if (Math.abs(alt) <= lim + 1e-6) {
      const r2 = tryDir(alt);
      if (!r2.blocked) r = r2;
    }
  }
  return r;
}

/**
 * Slide the ship from `pose` along direction `dirH` for `length` cm. Ships
 * stop at the first contact with a ship, island, rock, reef or the table
 * edge and forfeit the rest of the move.
 */
function planSlide(ship, pose, dirH, length) {
  const d = fwdVec(dirH);
  const STEP = 0.25;
  const near = nearbyObstacles(ship, pose.x + d.x * length / 2, pose.y + d.y * length / 2, length / 2 + ship.len / 2 + 2);
  let prevGap = poseGap(ship, pose, near).gap;
  let lastGood = 0;
  const at = s => ({ x: pose.x + d.x * s, y: pose.y + d.y * s, h: pose.h });
  for (let s = STEP; s <= length + 1e-6; s += STEP) {
    const g = poseGap(ship, at(s), near);
    if (g.gap < -COLLIDE_EPS && g.gap < prevGap - 1e-4) {
      // Refine the contact point.
      let lo = lastGood, hi = s;
      for (let k = 0; k < 7; k++) {
        const m = (lo + hi) / 2;
        const gm = poseGap(ship, at(m), near).gap;
        if (gm < -COLLIDE_EPS && gm < prevGap - 1e-4) hi = m; else lo = m;
      }
      return { end: at(lo), moved: lo, stoppedBy: g.kind, obj: g.obj };
    }
    prevGap = g.gap; lastGood = s;
  }
  if (lastGood < length) {
    const g = poseGap(ship, at(length), near);
    if (!(g.gap < -COLLIDE_EPS && g.gap < prevGap - 1e-4)) lastGood = length;
  }
  return { end: at(lastGood), moved: lastGood, stoppedBy: null, obj: null };
}

/** Full Move: set heading then click forward `clicks` times. */
function planMove(ship, targetH, clicks, pivotDeg) {
  const rot = planRotate(ship, targetH, pivotDeg);
  const start = { x: ship.x, y: ship.y, h: rot.h };
  const slide = planSlide(ship, start, rot.h, clicks * CLICK_LEN);
  return { rot, start, end: slide.end, moved: slide.moved, planned: clicks * CLICK_LEN, stoppedBy: slide.stoppedBy, obj: slide.obj, clicks };
}

// ─── Fittings ─────────────────────────────────────────
// Where each fitting sits on the deck, in ship coordinates (lx toward
// starboard, ly toward the bow). Index 0 is nearest the bow. Sail ships
// alternate masts and cargo; the Industry has a smokestack, cargo and its
// turret amidships.
function fittingLayout(ship) {
  const L = ship.len, out = [];
  const industry = ship.guns === 'industry';
  const n = industry ? ship.maxFit - 1 : ship.maxFit;
  for (let i = 0; i < n; i++) out.push({ kind: i % 2 ? 'cargo' : industry ? 'stack' : 'mast', lx: 0, ly: n === 1 ? 0 : L * 0.3 - i * (L * 0.6) / (n - 1) });
  if (industry) out.push({ kind: 'turret', lx: 0, ly: L * 0.08 });
  return out;
}
function fittingWorld(ship, idx, pose) {
  const f = fittingLayout(ship)[idx], p = pose || ship;
  const fw = fwdVec(p.h), sw = stbVec(p.h);
  return { x: p.x + sw.x * f.lx + fw.x * f.ly, y: p.y + sw.y * f.lx + fw.y * f.ly, kind: f.kind };
}

// ─── Cannon slots ─────────────────────────────────────
// Local coordinates: lx toward starboard, ly toward the bow. `dir` is the
// firing direction relative to the bow (0 forward, +PI/2 starboard).
// `free: true` means the slot can point any way (the Industry turret).
// Island slots are in islandSlots().
/** A turret heading, moved out of its blind cones ahead and astern to the nearest edge. */
function turretAim(ship, h) {
  let rel = angleDiff(h, ship.h);
  const sgn = rel < 0 ? -1 : 1, a = Math.abs(rel);
  if (a < TURRET_BLIND) rel = sgn * TURRET_BLIND;
  else if (a > Math.PI - TURRET_BLIND) rel = sgn * (Math.PI - TURRET_BLIND);
  return normAngle(ship.h + rel);
}
/** Can the turret bear on heading h? */
function turretBears(ship, h) { const a = Math.abs(angleDiff(h, ship.h)); return a >= TURRET_BLIND && a <= Math.PI - TURRET_BLIND; }

function shipSlots(ship) {
  const out = [];
  const holes = (FACTION_DEFS[ship.build] || {}).holes;
  // Each slot is where the ball leaves: the mouth of a cannon seated in the
  // hull's hole, MUZZLE_REACH out along the way it points (a turret's
  // swings with it, see muzzleOf). z is the ball's height there.
  const mouth = (lx, ly, dir, z, rest) => Object.assign({ lx: lx + Math.sin(dir) * MUZZLE_REACH, ly: ly + Math.cos(dir) * MUZZLE_REACH, dir, z: z + MUZZLE_RISE, hole: [lx, ly] }, rest);
  if (ship.guns === 'industry') {
    const bow = holes ? holes.bow : [0, ship.len / 2 - 1.5, 1.49], tur = holes ? holes.turret : [0, ship.len * 0.1, 2.09];
    out.push(mouth(bow[0], bow[1], 0, bow[2], { label: 'Bow', short: 'Bow', sock: 'bow' }));
    // The turret is a fitting: shot off, it cannot fire until repaired.
    if (hasTurret(ship)) out.push({ lx: tur[0], ly: tur[1], dir: 0, z: tur[2] + MUZZLE_RISE, free: true, label: 'Turret', short: 'Turret', sock: 'turret' });
  } else if (ship.guns === 'stern') {
    // Islanders: the gun swivels in one arc at the stern to three stops.
    // The outer two splay 15 degrees toward their own side (port-most to
    // port, starboard-most to starboard); the centre one points straight astern.
    const [hx, hy] = holes ? holes.stern : [0, -ship.len * 0.37], z = holes ? holes.z : 2.15;
    for (const k of [-1, 0, 1]) out.push(mouth(hx, hy, Math.PI - k * SLOT_SPLAY, z, { label: k < 0 ? 'Stern port' : k > 0 ? 'Stern starboard' : 'Stern', short: k < 0 ? 'Port' : k > 0 ? 'Stbd' : 'Centre', sock: 0 }));
  } else {
    // Slots down each side, bow to stern. A splayed slot angles 15 degrees
    // toward the bow or the stern; the rest fire square to the hull.
    const side = holes ? holes.side : [[-(ship.wid / 2 - 1.1), 0.8, 1], [-(ship.wid / 2 - 1), 0, 0], [-(ship.wid / 2 - 1.1), -0.8, -1]];
    const n = side.length, z = holes ? holes.z : 1.5;
    for (const sd of [-1, 1]) {
      side.forEach(([hx, hy, k], i) => {
        const pos = n === 3 ? [' fore', '', ' aft'][i] : [' bow', ' fore', ' aft', ' quarter'][i] || '';
        const short = n === 3 ? ['Fore', 'Mid', 'Aft'][i] : ['Bow', 'Fore', 'Aft', 'Qtr'][i];
        out.push(mouth(sd * Math.abs(hx), hy, sd * (Math.PI / 2 - k * SLOT_SPLAY), z, { label: (sd < 0 ? 'Port' : 'Starboard') + pos, short, sock: (sd < 0 ? 0 : n) + i }));
      });
    }
  }
  return out;
}

/** Where a shot from this slot leaves the cannon, fired on heading h (a turret swings its barrel to h). */
function muzzleOf(ship, slot, h) {
  const w = slotWorld(ship, slot);
  if (!slot.free) return { x: w.x, y: w.y, h: w.h, z: slot.z };
  const f = fwdVec(h);
  return { x: w.x + f.x * MUZZLE_REACH, y: w.y + f.y * MUZZLE_REACH, h, z: slot.z };
}

function slotWorld(ship, slot, pose) {
  if (slot.island != null) return { x: slot.x, y: slot.y, h: slot.h };
  const p = pose || ship;
  const f = fwdVec(p.h), s = stbVec(p.h);
  return { x: p.x + s.x * slot.lx + f.x * slot.ly, y: p.y + s.y * slot.lx + f.y * slot.ly, h: normAngle(p.h + slot.dir) };
}

// ─── Island cannon slots ──────────────────────────────
// The printed island (assets/stls/base-set/island.stl, 60.3 mm from its
// centre to its furthest point) has six cannon grooves, one every 60
// degrees, at 30, 90, 150... degrees in the model's own frame. Each has its
// peg slot 26.5 mm out from the centre, and a gun fires straight out along
// its groove. Which way the grooves face on the table depends on how the
// island is turned, which comes from its id, so every screen, the server
// and the 3D model agree without storing it.
const ISLAND_SLOT_R = 2.65; // cm from the island's centre
const ISLAND_SLOT_NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function islandTurn(t) { return (t.id * 2.39996) % TAU; }
/** The island's slots: where each peg is (x, y) and the heading it fires along (h). */
function islandSlots(t) {
  const out = [];
  for (let k = 0; k < 6; k++) {
    // Model groove angle a (from +X toward +Y) faces table heading PI - turn - a.
    const h = normAngle(Math.PI - islandTurn(t) - (Math.PI / 6 + k * Math.PI / 3));
    const f = fwdVec(h), r = ISLAND_SLOT_R;
    out.push({ island: t.id, k, x: t.x + f.x * r, y: t.y + f.y * r, h, label: ISLAND_SLOT_NAMES[Math.round(h / (Math.PI / 4)) % 8] });
  }
  return out;
}

/** Where an island gun's shot starts: the island's edge along heading h. */
function islandGunOrigin(t, h) {
  const f = fwdVec(h);
  const r = t.r + BALL_R + 0.1;
  return { x: t.x + f.x * r, y: t.y + f.y * r, h };
}

// ─── Cannonball trace ─────────────────────────────────
// A shot is { h, elev, v, drag, curl, kicks, tumble, spins }: the heading it left the
// muzzle on, the elevation ('flat' or 'lob'), the spring's speed as a
// fraction of MUZZLE_V, the table's skid drag and curl, the sideways knock
// and the spin each bounce gives it, and its turn as it drops into a skid. wobbleShot() rolls these once, on the server;
// everything after is worked out from them, so every screen draws the same
// path. shotPath() turns a shot into legs: flight and hops (arcs), then a
// skid in short straight pieces that curl as the ball slows.

/** Distance along a ray from a point on the table until it leaves the table. */
function rayExit(ox, oy, dx, dy) {
  const t = G.table;
  if (t.shape === 'circle') {
    const cx = ox - t.r, cy = oy - t.r;
    const bq = cx * dx + cy * dy, cq = cx * cx + cy * cy - t.r * t.r;
    const disc = bq * bq - cq;
    return disc < 0 ? 0 : Math.max(0, -bq + Math.sqrt(disc));
  }
  let s = Infinity;
  if (dx > 1e-9) s = Math.min(s, (t.w - ox) / dx); else if (dx < -1e-9) s = Math.min(s, -ox / dx);
  if (dy > 1e-9) s = Math.min(s, (t.h - oy) / dy); else if (dy < -1e-9) s = Math.min(s, -oy / dy);
  return Math.max(0, s);
}

/** Roll the dice for one shot along heading h. */
function wobbleShot(h, elev, z) {
  const tri = () => rand() + rand() - 1; // -1..1, most likely 0
  return {
    ...(z != null ? { z } : {}),
    h: normAngle(h + tri() * SPREAD_MAX),
    elev: elev === 'lob' ? 'lob' : 'flat',
    v: Math.max(0.75, 1 + gaussRandom() * MUZZLE_V_SD),
    drag: Math.max(0.4, 1 + gaussRandom() * SKID_DECEL_SD),
    curl: (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 1.2),
    kicks: BOUNCE_KICK_SD.map(sd => gaussRandom() * sd),
    tumble: gaussRandom() * TUMBLE_SD,
    spins: BOUNCE_KICK_SD.map(() => gaussRandom() * SPIN_SD),
  };
}

/** The same shot with no luck in it: what the cannon is pointed at. */
function aimedShot(h, elev, z) { return { ...(z != null ? { z } : {}), h, elev: elev === 'lob' ? 'lob' : 'flat', v: 1, drag: 1, curl: 0, kicks: [0, 0, 0, 0], tumble: 0, spins: [0, 0, 0, 0] }; }

/**
 * Legs of a shot from (ox, oy). Each leg is straight on the table:
 * { x, y, fx, fy, s0, s1, z0, k1, k2 } with the ball's height at distance
 * u into the leg z0 + k1 u - k2 u^2 (0 for the skid). Ends at the table
 * edge (edge: true) or where the ball stops.
 */
function shotPath(ox, oy, shot) {
  const legs = [];
  let x = ox, y = oy, h = shot.h, s = 0, edge = false;
  const speed = MUZZLE_V * shot.v, el = ELEVATIONS[shot.elev] || 0;
  let vh = speed * Math.cos(el), vz = speed * Math.sin(el), z = shot.z != null ? shot.z : MUZZLE_H;
  // Add a straight leg of length len at heading h; false once off the table.
  const push = (len, z0, k1, k2) => {
    const f = fwdVec(h), out = rayExit(x, y, f.x, f.y);
    const cut = out < len;
    const L = cut ? out : len;
    legs.push({ x, y, fx: f.x, fy: f.y, s0: s, s1: s + L, z0, k1, k2 });
    x += f.x * L; y += f.y * L; s += L;
    if (cut) edge = true;
    return !cut;
  };
  // Flight, then hops while the bounce still leaves the table. Each bounce
  // knocks the ball aside and sets the heavy-ended cone spinning, and the
  // spin keeps bending its path (radians per cm) until the next bounce and
  // on into the skid.
  let spin = 0;
  for (let bounce = 0; bounce < 6; bounce++) {
    const t = (vz + Math.sqrt(vz * vz + 2 * GRAVITY * z)) / GRAVITY; // time to touch down
    const len = vh * t, k1 = vz / vh, k2 = GRAVITY / (2 * vh * vh);
    // A spinning hop curves, so it goes in short pieces that keep the arc.
    const n = spin ? Math.max(1, Math.ceil(len / 2)) : 1;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const u0 = len * i / n, piece = len / n;
      ok = push(piece, z + k1 * u0 - k2 * u0 * u0, k1 - 2 * k2 * u0, k2);
      h = normAngle(h + spin * piece);
    }
    if (!ok) break;
    const vDown = GRAVITY * t - vz;
    vz = vDown * BOUNCE_E; vh *= BOUNCE_KEEP; z = 0;
    h = normAngle(h + (shot.kicks[bounce] || 0));
    spin += (shot.spins && shot.spins[bounce]) || 0;
    if (vz < HOP_MIN_VZ) break;
  }
  // Skid: a tapered ball tumbles onto its side, then scrubs speed and
  // curls, tighter as it slows.
  h = normAngle(h + (shot.tumble || 0));
  const a = SKID_DECEL * shot.drag;
  let v2 = vh * vh;
  while (!edge && v2 > 1) {
    const ds = 1.5;
    const vNow = Math.sqrt(v2);
    const len = Math.min(ds, v2 / (2 * a));
    if (!push(len, 0, 0, 0)) break;
    v2 -= 2 * a * len;
    h = normAngle(h + shot.curl * SKID_CURL * len / (vNow + SKID_CURL_V) + spin * len);
    spin *= SPIN_SKID_KEEP;
    if (s > 400) break;
  }
  return { legs, total: s, edge };
}

/** Where the ball is at distance s along a path: { x, y, z }. */
function pathAt(path, s) {
  const L = path.legs;
  let leg = L[L.length - 1];
  for (const g of L) if (s <= g.s1) { leg = g; break; }
  const u = clamp(s - leg.s0, 0, leg.s1 - leg.s0);
  return { x: leg.x + leg.fx * u, y: leg.y + leg.fy * u, z: Math.max(0, leg.z0 + leg.k1 * u - leg.k2 * u * u) };
}

/**
 * Trace a shot from (ox, oy). src = { ship } or { island } to exclude the
 * firing object. Returns the first contact:
 * { kind: 'ship'|'terrain'|'edge'|'none', obj, x, y, s, path }.
 * The ball is checked every 0.3 cm, but only near objects close to its path.
 */
function traceShot(src, ox, oy, shot) {
  const path = shotPath(ox, oy, shot);
  const STEP = 0.3;
  let best = null;
  // Walk each leg where the ball could reach an object centred at (x, y).
  const scan = (x, y, reach, test) => {
    for (const g of path.legs) {
      if (best && g.s0 >= best.s) break;
      const dx = x - g.x, dy = y - g.y;
      const along = dx * g.fx + dy * g.fy, perp = Math.abs(dx * g.fy - dy * g.fx);
      if (perp > reach) continue;
      const len = g.s1 - g.s0;
      const lo = Math.max(0, along - reach), hi = Math.min(len, along + reach, best ? best.s - g.s0 : Infinity);
      for (let u = Math.ceil(lo / STEP - 1e-9) * STEP; u <= hi + 1e-9; u += STEP) {
        const px = g.x + g.fx * u, py = g.y + g.fy * u;
        if (test(px, py, Math.max(0, g.z0 + g.k1 * u - g.k2 * u * u))) { best = { s: g.s0 + u, x: px, y: py }; return true; }
      }
    }
    return false;
  };
  let hit = null;
  for (const o of allShips()) {
    if (o === src.ship) continue;
    const sg = shipSeg(o), rr = sg.r + BALL_R;
    if (scan(o.x, o.y, o.len / 2 + BALL_R + 0.3, (x, y, hg) => hg < (o.height || HULL_H) && ptSegDist(x, y, sg.ax, sg.ay, sg.bx, sg.by) <= rr)) hit = { kind: 'ship', obj: o };
  }
  for (const t of G.terrain) {
    if (t === src.island) continue;
    const ht = TERRAIN_DEFS[t.type].height, rr = t.r + BALL_R;
    if (scan(t.x, t.y, rr + 0.3, (x, y, hg) => hg < ht && dist(x, y, t.x, t.y) <= rr)) hit = { kind: 'terrain', obj: t };
  }
  if (hit) return Object.assign(hit, best, { path });
  const end = pathAt(path, path.total);
  return { kind: path.edge ? 'edge' : 'none', obj: null, x: end.x, y: end.y, s: path.total, path };
}
