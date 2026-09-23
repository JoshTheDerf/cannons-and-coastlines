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

// ─── Cannon slots ─────────────────────────────────────
// Local coordinates: lx toward starboard, ly toward the bow. `dir` is the
// firing direction relative to the bow (0 forward, +PI/2 starboard).
// `free: true` means the slot can point any way (turret, island).
function shipSlots(ship) {
  const out = [];
  const L = ship.len, W = ship.wid, off = BALL_R + 0.1;
  if (ship.guns === 'industry') {
    out.push({ lx: 0, ly: L / 2 + off, dir: 0, label: 'Bow' });
    // The turret is the last fitting to go (see applyHit), so it works while
    // the ship still has any fitting.
    if (ship.fit > 0) out.push({ lx: 0, ly: L * 0.08, dir: 0, free: true, label: 'Turret' });
  } else if (ship.guns === 'stern') {
    for (const lx of [-0.3 * W, 0, 0.3 * W]) out.push({ lx, ly: -(L / 2 + off), dir: Math.PI, label: 'Stern' });
  } else {
    for (const side of [-1, 1]) {
      for (const ly of [0.27 * L, 0, -0.27 * L]) {
        out.push({ lx: side * (W / 2 + off), ly, dir: side * Math.PI / 2, label: side < 0 ? 'Port' : 'Starboard' });
      }
    }
  }
  return out;
}

function slotWorld(ship, slot, pose) {
  const p = pose || ship;
  const f = fwdVec(p.h), s = stbVec(p.h);
  return { x: p.x + s.x * slot.lx + f.x * slot.ly, y: p.y + s.y * slot.lx + f.y * slot.ly, h: normAngle(p.h + slot.dir) };
}

/** Where an island gun sits when pointed along heading h. */
function islandGunOrigin(t, h) {
  const f = fwdVec(h);
  const r = t.r + BALL_R + 0.1;
  return { x: t.x + f.x * r, y: t.y + f.y * r, h };
}

// ─── Cannonball trace ─────────────────────────────────
function ballHeight(s, D) {
  if (s >= D) return 0;
  const u = s / D;
  return 4 * APEX_K * D * u * (1 - u);
}

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

/**
 * Trace a shot from (ox, oy) along heading h, landing at distance D, then
 * rolling on along h + bounce. src = { ship } or { island } to exclude the
 * firing object. Returns the first contact:
 * { kind: 'ship'|'terrain'|'edge'|'none', obj, x, y, s }.
 * The ball is checked every 0.3 cm, but only near objects close to its path.
 */
function traceShot(src, ox, oy, h, D, bounce) {
  const f = fwdVec(h), fb = fwdVec(h + (bounce || 0));
  const total = D * (1 + ROLL_K);
  const STEP = 0.3;
  const lx = ox + f.x * D, ly = oy + f.y * D;
  let exitS = rayExit(ox, oy, f.x, f.y);
  if (exitS >= D) exitS = D + rayExit(lx, ly, fb.x, fb.y);
  const endS = Math.min(total, exitS);
  const px = s => (s <= D ? ox + f.x * s : lx + fb.x * (s - D));
  const py = s => (s <= D ? oy + f.y * s : ly + fb.y * (s - D));

  let best = null;
  // Window of path distance where the ball could reach an object centred
  // at (x, y) with radius `reach` (flight leg, then roll leg).
  const scan = (x, y, reach, test) => {
    const legs = [[ox, oy, f, 0, D], [lx, ly, fb, D, total]];
    for (const [sx, sy, d, s0, s1] of legs) {
      const dx = x - sx, dy = y - sy;
      const along = dx * d.x + dy * d.y, perp = Math.abs(dx * d.y - dy * d.x);
      if (perp > reach) continue;
      const lo = Math.max(s0, s0 + along - reach), hi = Math.min(s1, s0 + along + reach, endS, best ? best.s : Infinity);
      for (let s = Math.ceil(lo / STEP - 1e-9) * STEP; s <= hi + 1e-9; s += STEP) {
        if (test(px(s), py(s), ballHeight(s, D))) { best = { s, x: px(s), y: py(s) }; return true; }
      }
    }
    return false;
  };
  let hit = null;
  for (const o of allShips()) {
    if (o === src.ship) continue;
    const sg = shipSeg(o), rr = sg.r + BALL_R;
    if (scan(o.x, o.y, o.len / 2 + BALL_R + 0.3, (x, y, hg) => hg < HULL_H && ptSegDist(x, y, sg.ax, sg.ay, sg.bx, sg.by) <= rr)) hit = { kind: 'ship', obj: o };
  }
  for (const t of G.terrain) {
    if (t === src.island) continue;
    const ht = TERRAIN_DEFS[t.type].height, rr = t.r + BALL_R;
    if (scan(t.x, t.y, rr + 0.3, (x, y, hg) => hg < ht && dist(x, y, t.x, t.y) <= rr)) hit = { kind: 'terrain', obj: t };
  }
  if (hit) return Object.assign(hit, best);
  if (exitS < total) return { kind: 'edge', obj: null, x: px(exitS), y: py(exitS), s: exitS };
  return { kind: 'none', obj: null, x: px(total), y: py(total), s: total };
}

/** Apply the cannon's wobble to an intended shot. */
function wobbleShot(h, D) {
  return {
    h: normAngle(h + gaussRandom() * SHOT_ANGLE_SD),
    D: clamp(D * (1 + gaussRandom() * SHOT_RANGE_SD), RANGE_MIN * 0.8, RANGE_MAX * 1.1),
    b: gaussRandom() * BOUNCE_SD,
  };
}

function powerToRange(p) { return RANGE_MIN + clamp(p, 0, 1) * (RANGE_MAX - RANGE_MIN); }
function rangeToPower(D) { return clamp((D - RANGE_MIN) / (RANGE_MAX - RANGE_MIN), 0, 1); }
