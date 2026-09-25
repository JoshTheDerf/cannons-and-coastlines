// Cannons & Coastlines, digital edition: state.js
// Game state, setup, rule queries, damage, coins, scoring and turn order.
// Shared by the browser and the online game server (no DOM, no timing).
// All randomness goes through rand() (constants.js).

let G = null;

function makeShip(p, fid, i, used = new Set()) {
  const f = FACTION_DEFS[fid];
  return {
    id: `p${p}s${i}`, owner: p, origin: p, build: fid,
    name: shipName(fid, used),
    len: f.len, wid: f.wid, height: f.height || HULL_H, guns: f.guns, moveCount: f.moveCount, hullStyle: f.hull,
    maxFit: f.fittings, fit: f.fittings,
    fitMask: Array(f.fittings).fill(true),  // which fittings are aboard (see fittingLayout)
    turretRel: 0,        // Industry: turret facing relative to the bow, kept between turns
    x: 0, y: 0, h: 0, placed: false,
    // A ship's turn (rulebook v0.6): one action (Set Heading, Fire, or an
    // Island action), then click forward 1 to Move Count. Island actions and
    // dead ships skip the click.
    acted: false,        // finished all its turns this round
    turnsLeft: 0,        // 1, plus one per Signal Flags transfer received
    stage: null,         // 'action' (turn not started) | 'click' (fired, still owes its click)
    noAction: false,     // gave its action away with Signal Flags: only clicks forward
    pending: null,       // 'shot2': Skilled Gunner's second shot
    gunner: false, braced: false, stoneUsed: false, shotsDone: 0,
    touchPrev: [],       // islands touched at the end of the owner's previous turn
  };
}

/**
 * opts: { seats: [{ faction, color, name, ai }], setup: 'quick'|'custom',
 *         stalemate, table: 'rect'|'round'|a TABLES id, seating: 'sides'|'ends' }
 * 'rect' is the 4 ft square, 'round' a round table sized to the seats.
 * seating, for two players: on a long table they face across it
 * ('sides', the default), start at its two ends ('ends'), or face across
 * it from opposite halves ('diagonal'); on a round table they sit
 * opposite (the default) or a quarter of the way round ('quarter').
 * Seats are numbered 1..N in turn order.
 */
function newGame(opts) {
  const n = opts.seats.length;
  // Two players: a quarter of the way round a round table, diagonal across
  // a rectangular one, unless the game says otherwise.
  const shapeOf = TABLES[opts.table === 'round' ? 'round6' : opts.table];
  if (n === 2 && !opts.seating && opts.table !== 'rect') opts.seating = opts.table === 'round' || (shapeOf && shapeOf.shape === 'circle') ? 'quarter' : 'diagonal';
  const bag = [];
  for (let k = 0; k < n; k++) for (const [id, c] of Object.entries(COIN_SET)) for (let i = 0; i < c; i++) bag.push(id);
  shuffle(bag);
  const emptyCoins = () => Object.fromEntries(COIN_ORDER.map(id => [id, 0]));
  const preset = TABLES[opts.table === 'round' ? ROUND_FOR[n] || 'round6' : opts.table];
  const round = preset ? preset.shape === 'circle' : opts.table === 'round';
  G = {
    opts,
    phase: 'islands',
    order: opts.seats.map((_, i) => i + 1),
    active: 1,
    turn: 1,
    table: preset ? (round ? { shape: 'circle', r: preset.r } : { shape: 'rect', w: preset.w, h: preset.h })
      : { shape: 'rect', w: RECT_TABLE, h: RECT_TABLE },
    islandCount: ISLANDS_FOR[n] || 10,
    factions: {},
    terrain: [],
    players: {},
    bag,
    coinPhase: true,
    lastFlagChange: 0,
    prizes: [],          // fittings and hulls knocked off enemy ships: { p, ship, kind }
    collected: [],       // islands that have paid out this turn
    winner: null, endReason: '',
    terrainPlaced: {},
    stats: {},
    ai: null,
  };
  if (!round) G.table.seats = rectSeats(n, opts.seating);
  const usedNames = new Set();
  opts.seats.forEach((s, i) => {
    const p = i + 1;
    s.faction = factionId(s.faction);
    G.factions[p] = s.faction;
    G.players[p] = { ships: [], coins: emptyCoins(), sunk: [], color: s.color != null ? s.color : i, name: s.name || `Player ${p}`, ai: !!s.ai };
    G.terrainPlaced[p] = 0;
    G.stats[p] = { shots: 0, hits: 0, sunk: 0 };
    const f = FACTION_DEFS[s.faction];
    for (let k = 0; k < f.shipCount; k++) G.players[p].ships.push(makeShip(p, s.faction, k, usedNames));
  });
  if (opts.setup === 'quick') {
    randomIslands();
    randomTerrain(round ? Math.min(6, 2 + Math.ceil(n / 2)) : 4);
    for (const p of G.order) autoDeploy(p);
    if (n >= 3) flankRocks();
    applyHomeWaters();
    G.phase = 'play';
    beginTurn();
  }
  return G;
}

// ─── Setup ────────────────────────────────────────────

/** The rulebook keeps islands 12" from every edge; a 30" folding table cannot, so there they sit as far in as it allows. */
function islandEdgeMin() { const sz = tableSize(); return Math.min(ISLAND_EDGE_MIN, Math.min(sz.w, sz.h) / 2 - 9); }

function islandSpotProblem(x, y, r) {
  if (edgeDist(x, y) - r < islandEdgeMin()) return 'Islands stay 12" from every edge.';
  for (const t of G.terrain) {
    const gap = dist(x, y, t.x, t.y) - r - t.r;
    if (t.type === 'island' && gap < ISLAND_GAP_MIN) return 'Islands stay 6" apart.';
    if (t.type !== 'island' && gap < 1) return 'Too close to other terrain.';
  }
  return null;
}

// The rulebook lets rocks and reefs go anywhere. The digital table keeps them
// out of a strip along the edge so every fleet can line up on it.
const DEPLOY_STRIP = 16;
function terrainSpotProblem(x, y, r) {
  if (edgeDist(x, y) - r < 1) return 'Keep it on the table.';
  if (G.table.shape === 'circle') { if (edgeDist(x, y) - r < DEPLOY_STRIP) return 'Keep the deployment edge clear.'; }
  else {
    const ends = (G.table.seats || []).some(s => s.edge === 'left' || s.edge === 'right');
    if (y - r < DEPLOY_STRIP || y + r > G.table.h - DEPLOY_STRIP || (ends && (x - r < DEPLOY_STRIP || x + r > G.table.w - DEPLOY_STRIP))) return 'Keep the deployment edges clear.';
  }
  for (const t of G.terrain) if (dist(x, y, t.x, t.y) - r - t.r < 2) return 'Too close to other terrain.';
  return null;
}

function addTerrain(type, x, y, r) {
  G.terrain.push({ type, x, y, r, owner: null, id: G.terrain.length });
}

function islandRadius() { return TERRAIN_DEFS.island.r; }
function terrainRadius(type) { return TERRAIN_DEFS[type].r; }

function randomPointOnTable(margin) {
  const c = tableCenter(), sz = tableSize();
  for (let k = 0; k < 50; k++) {
    const x = margin + rand() * (sz.w - 2 * margin), y = margin + rand() * (sz.h - 2 * margin);
    if (edgeDist(x, y) >= margin) return { x, y };
  }
  return c;
}

function randomIslands() {
  // Small tables may not fit the rulebook's count: place as many as fit.
  for (let want = G.islandCount; want >= 2; want--) if (placeIslands(want)) { G.islandCount = want; break; }
  G.terrain.forEach((t, i) => { t.id = i; });
}

function placeIslands(want) {
  const keep = () => G.terrain.filter(t => t.type !== 'island');
  for (let tries = 0; tries < 150; tries++) {
    G.terrain = keep();
    let placed = 0;
    for (let i = 0; i < want; i++) {
      for (let a = 0; a < 150; a++) {
        const r = islandRadius();
        const pt = randomPointOnTable(islandEdgeMin() + r);
        if (!islandSpotProblem(pt.x, pt.y, r)) { addTerrain('island', pt.x, pt.y, r); placed++; break; }
      }
      if (placed <= i) break;
    }
    if (placed === want) return true;
    // Crowded tables: fall back to a jittered ring layout.
    if (tries > 40) {
      G.terrain = keep();
      const c = tableCenter(), ring = want - 1;
      const span = (G.table.shape === 'circle' ? G.table.r : Math.min(G.table.w, G.table.h) / 2) - islandEdgeMin() - 7;
      const off = rand() * TAU;
      addTerrain('island', c.x + (rand() - 0.5) * 3, c.y + (rand() - 0.5) * 3, islandRadius());
      for (let k = 0; k < ring; k++) {
        const a = off + k * TAU / ring;
        addTerrain('island', c.x + Math.cos(a) * span * 0.97, c.y + Math.sin(a) * span * 0.97, islandRadius());
      }
      const ok = G.terrain.filter(t => t.type === 'island').every((t, i, arr) =>
        edgeDist(t.x, t.y) - t.r >= islandEdgeMin() - 0.01 && arr.every(o => o === t || dist(t.x, t.y, o.x, o.y) - t.r - o.r >= ISLAND_GAP_MIN - 0.01));
      if (ok) return true;
    }
  }
  return false;
}

function randomTerrain(n) {
  const types = ['rock', 'reef'];
  for (let i = 0; i < n; i++) {
    const type = types[i % 2], r = terrainRadius(type);
    for (let a = 0; a < 300; a++) {
      const pt = randomPointOnTable(DEPLOY_STRIP + r);
      if (!terrainSpotProblem(pt.x, pt.y, r) && !islandSpotProblemForTerrain(pt.x, pt.y, r)) { addTerrain(type, pt.x, pt.y, r); break; }
    }
  }
  G.terrain.forEach((t, i) => { t.id = i; });
}
// Leave a ship-length of water around islands when placing random terrain.
function islandSpotProblemForTerrain(x, y, r) {
  return G.terrain.some(t => t.type === 'island' && dist(x, y, t.x, t.y) - r - t.r < 9);
}

/**
 * Seats on a rectangular table: { edge, along, span } per seat, in turn
 * order going round the table (bottom left to right, up the right end,
 * top right to left, down the left end). along is the seat's middle,
 * measured along its edge (x for top and bottom, y for the ends); span is
 * the stretch of edge it has. Two players face across the table, or with
 * seating 'ends' start at its two ends. More spread over the edges by
 * length; an end narrower than 70 cm takes no one.
 */
function rectSeats(n, seating) {
  const { w, h } = G.table;
  if (n <= 2 && seating === 'diagonal') {
    const long = w >= h ? ['bottom', 'top'] : ['left', 'right'], L = Math.max(w, h);
    return [{ edge: long[0], along: L / 4, span: L / 2 }, { edge: long[1], along: 3 * L / 4, span: L / 2 }];
  }
  if (n <= 2) {
    const ends = seating === 'ends' ? (w >= h ? ['left', 'right'] : ['bottom', 'top']) : (w >= h ? ['bottom', 'top'] : ['left', 'right']);
    return ends.map(edge => ({ edge, along: edge === 'bottom' || edge === 'top' ? w / 2 : h / 2, span: edge === 'bottom' || edge === 'top' ? w : h }));
  }
  const edges = [{ edge: 'bottom', len: w }, { edge: 'right', len: h }, { edge: 'top', len: w }, { edge: 'left', len: h }].filter(e => e.len >= 70);
  const total = edges.reduce((a, e) => a + e.len, 0);
  edges.forEach(e => { e.want = n * e.len / total; e.seats = Math.floor(e.want); });
  let left = n - edges.reduce((a, e) => a + e.seats, 0);
  for (const e of edges.slice().sort((a, b) => (b.want - b.seats) - (a.want - a.seats))) if (left-- > 0) e.seats++;
  const out = [];
  for (const e of edges) {
    for (let k = 0; k < e.seats; k++) {
      // Walk each edge in the going-round direction: bottom and right run up the coordinate, top and left run down it.
      const t = (k + 0.5) * e.len / e.seats;
      const along = e.edge === 'bottom' ? t : e.edge === 'right' ? h - t : e.edge === 'top' ? w - t : t;
      out.push({ edge: e.edge, along, span: e.len / e.seats });
    }
  }
  return out;
}

function seatOf(p) {
  const S = G.table.seats;
  return S ? S[G.order.indexOf(p)] : { edge: p === 1 ? 'bottom' : 'top', along: G.table.w / 2, span: G.table.w };
}

const EDGE_HEADING = { bottom: 0, top: Math.PI, left: Math.PI / 2, right: 3 * Math.PI / 2 };

/** Where a seat's fleet lines up: a point on the edge and the inward heading. */
function seatHome(p) {
  if (G.table.shape === 'circle') {
    const k = G.order.indexOf(p), n = G.order.length;
    const a = Math.PI / 2 + k * (n === 2 && G.opts.seating === 'quarter' ? Math.PI / 2 : TAU / n);
    const c = tableCenter();
    return { x: c.x + Math.cos(a) * G.table.r, y: c.y + Math.sin(a) * G.table.r, h: headingTo(-Math.cos(a), -Math.sin(a)), a };
  }
  const s = seatOf(p), { w, h } = G.table;
  const x = s.edge === 'left' ? 0 : s.edge === 'right' ? w : s.along;
  const y = s.edge === 'top' ? 0 : s.edge === 'bottom' ? h : s.along;
  return { x, y, h: EDGE_HEADING[s.edge] };
}

/** A seat's stretch of rectangular table edge, as a segment in table coordinates. */
function seatEdgeSegment(p) {
  const s = seatOf(p), { w, h } = G.table, a = s.along - s.span / 2, b = s.along + s.span / 2;
  if (s.edge === 'bottom') return { x1: a, y1: h, x2: b, y2: h };
  if (s.edge === 'top') return { x1: a, y1: 0, x2: b, y2: 0 };
  if (s.edge === 'left') return { x1: 0, y1: a, x2: 0, y2: b };
  return { x1: w, y1: a, x2: w, y2: b };
}

/** Pose for a ship lined up at the owner's edge where it is nearest to table point pt. */
function deployPoseAt(p, ship, pt) {
  if (G.table.shape === 'circle') {
    const c = tableCenter(), home = seatHome(p);
    return rimPose(p, ship, angleDiff(Math.atan2(pt.y - c.y, pt.x - c.x), home.a) * G.table.r);
  }
  return deployPose(p, ship, seatAlong(p, pt));
}

/** How far along its own edge a table point is (x for top and bottom, y for the ends). */
function seatAlong(p, pt) { const e = seatOf(p).edge; return e === 'left' || e === 'right' ? pt.y : pt.x; }

/** Pose for a ship lined up touching its owner's (rectangular) edge, facing inward. */
function deployPose(p, ship, along) {
  const { w, h } = G.table, e = seatOf(p).edge, L = ship.len / 2 + 0.02, m = ship.wid / 2 + 0.05;
  if (e === 'bottom') return { x: clamp(along, m, w - m), y: h - L, h: 0 };
  if (e === 'top') return { x: clamp(along, m, w - m), y: L, h: Math.PI };
  if (e === 'left') return { x: L, y: clamp(along, m, h - m), h: Math.PI / 2 };
  return { x: w - L, y: clamp(along, m, h - m), h: 3 * Math.PI / 2 };
}

function rimPose(p, ship, along) {
  const home = seatHome(p), c = tableCenter(), R = G.table.r;
  const a = home.a + along / R;
  const rr = R - ship.len / 2 - 0.05;
  return { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr, h: headingTo(-Math.cos(a), -Math.sin(a)) };
}

function canDeployAt(ship, pose) {
  return poseGap(ship, pose).gap >= -COLLIDE_EPS;
}

function autoDeploy(p) {
  const ships = G.players[p].ships;
  ships.forEach(s => { s.placed = false; });
  const n = ships.length;
  const circle = G.table.shape === 'circle', seat = circle ? null : seatOf(p);
  const spacing = circle ? 17 : Math.min(22, (seat.span - 20) / n);
  ships.forEach((s, i) => {
    const base = (i - (n - 1) / 2) * spacing;
    for (let k = 0; k < 40; k++) {
      const off = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.5;
      const pose = circle ? rimPose(p, s, off) : deployPose(p, s, seat.along + off);
      if (canDeployAt(s, pose)) { Object.assign(s, pose); break; }
      if (k === 0) Object.assign(s, pose);
    }
    s.placed = true;
  });
}

/**
 * Round tables with neighbours: a rock just past each end of every fleet's
 * start line, a little in from the rim. Without them, the first turn is a
 * free broadside down the rim into the next fleet. Those shots are mostly
 * lobs that fly over anything halfway, so the rocks sit where the ball
 * comes back down, beside the fleet it would hit.
 */
const FLANK_ROCK = { past: 9, inward: 10, get r() { return TERRAIN_DEFS.rock.r; } };
function flankRocks() {
  if (G.table.shape !== 'circle') { flankRocksRect(); return; }
  const c = tableCenter(), R = G.table.r;
  for (const p of G.order) {
    const home = seatHome(p).a;
    const rel = G.players[p].ships.map(s => angleDiff(Math.atan2(s.y - c.y, s.x - c.x), home));
    for (const [edge, side] of [[Math.min(...rel), -1], [Math.max(...rel), 1]]) {
      const a = home + edge + side * FLANK_ROCK.past / R;
      for (let k = 0; k < 4; k++) {
        const rr = R - FLANK_ROCK.inward - k * 3;
        const x = c.x + Math.cos(a) * rr, y = c.y + Math.sin(a) * rr, r = FLANK_ROCK.r;
        const clear = allShips().every(s => !shipTouchesTerrain(s, { x, y, r })) &&
          G.terrain.every(t => dist(x, y, t.x, t.y) - r - t.r >= 1);
        if (clear) { addTerrain('rock', x, y, r); break; }
      }
    }
  }
  G.terrain.forEach((t, i) => { t.id = i; });
}

/** The same on a rectangular table: just past each end of every fleet's line, in from its edge. */
function flankRocksRect() {
  const { w, h } = G.table, r = FLANK_ROCK.r;
  for (const p of G.order) {
    const e = seatOf(p).edge, along = G.players[p].ships.map(s => seatAlong(p, s));
    for (const [end, side] of [[Math.min(...along), -1], [Math.max(...along), 1]]) {
      const a = end + side * FLANK_ROCK.past;
      for (let k = 0; k < 4; k++) {
        const d = FLANK_ROCK.inward + k * 3;
        const x = e === 'left' ? d : e === 'right' ? w - d : a, y = e === 'top' ? d : e === 'bottom' ? h - d : a;
        const clear = edgeDist(x, y) >= r + 1 && allShips().every(s => !shipTouchesTerrain(s, { x, y, r })) &&
          G.terrain.every(t => dist(x, y, t.x, t.y) - r - t.r >= 1);
        if (clear) { addTerrain('rock', x, y, r); break; }
      }
    }
  }
  G.terrain.forEach((t, i) => { t.id = i; });
}

/** Islanders: claim the nearest island and park one catamaran touching it. */
function applyHomeWaters() {
  for (const p of G.order) {
    if (FACTION_DEFS[G.factions[p]].passive !== 'home') continue;
    const home = seatHome(p);
    let best = null;
    G.terrain.forEach(t => {
      if (t.type !== 'island' || t.owner != null) return;
      const d = dist(t.x, t.y, home.x, home.y);
      if (!best || d < best.d) best = { t, d };
    });
    if (!best) continue;
    const t = best.t;
    t.owner = p;
    const ships = G.players[p].ships;
    const ship = ships.slice().sort((a, b) => dist(a.x, a.y, t.x, t.y) - dist(b.x, b.y, t.x, t.y))[0];
    const baseAng = headingTo(home.x - t.x, home.y - t.y); // from the island toward home
    for (let k = 0; k < 24; k++) {
      const ang = baseAng + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
      const f = fwdVec(ang);
      const pose = { x: t.x + f.x * (t.r + ship.len / 2 + 0.1), y: t.y + f.y * (t.r + ship.len / 2 + 0.1), h: normAngle(ang + Math.PI) };
      const save = { x: ship.x, y: ship.y, h: ship.h };
      Object.assign(ship, pose);
      if (poseGap(ship, ship).gap >= -COLLIDE_EPS && touchingIslands(ship).includes(t.id)) break;
      Object.assign(ship, save);
    }
    ship.touchPrev = touchingIslands(ship);
  }
}

// ─── Queries ──────────────────────────────────────────

const isDead = s => s.fit <= 0;
const passiveOf = p => FACTION_DEFS[G.factions[p]].passive;
/** Stone Hulls (rulebook v0.6): the first hit each turn is ignored, but only at sea, not touching an island. */
const stoneShields = ship => passiveOf(ship.owner) === 'stone' && !ship.stoneUsed && !touchingIslands(ship).length;
// Faction passives belong to the fleet that owns the ship (rulebook, Fleets:
// "Coins and the faction passive belong to the fleet"). Hull stats such as
// move count, fittings and gun layout stay with the ship itself.
const pivotFor = ship => (passiveOf(ship.owner) === 'disciplined' ? 180 : 90);
const opponents = p => G.order.filter(q => q !== p);
const enemyShips = p => opponents(p).flatMap(q => G.players[q].ships);
const seatName = p => G.players[p].name;

function shipById(id) {
  for (const p of G.order) for (const s of G.players[p].ships) if (s.id === id) return s;
  return null;
}

function coinTotal(p) { return COIN_ORDER.reduce((n, id) => n + (G.players[p].coins[id] || 0), 0); }
function islandsHeld(p) { return G.terrain.filter(t => t.type === 'island' && t.owner === p).length; }
function islands() { return G.terrain.filter(t => t.type === 'island'); }

/** Active (not dead) ships of seat p touching island t. */
function defendersAt(t, p) {
  return G.players[p].ships.filter(s => !isDead(s) && shipTouchesTerrain(s, t));
}

function raiseFlagProblem(ship, t) {
  if (t.owner === ship.owner) return 'Already your island.';
  // Dead ships do not defend, so they do not take islands either.
  if (isDead(ship)) return 'A dead ship cannot raise a flag.';
  if (!ship.touchPrev.includes(t.id)) return 'Touch it at the end of a turn first.';
  if (opponents(ship.owner).some(q => defendersAt(t, q).length)) return 'Drive off the enemy ships first.';
  return null;
}

/**
 * Why ship s may not Collect at island t right now, or null if it may.
 * Rulebook v0.6: the ship of yours nearest an island you hold collects
 * there, touching or not, and each island pays once a turn. Enemy ships
 * never block it.
 */
function collectProblem(s, t) {
  // Dead ships take no island actions, and do not count as nearest either.
  if (isDead(s)) return 'A dead ship cannot collect.';
  if (t.owner !== s.owner) return 'You can only collect from an island you hold.';
  if ((G.collected || []).includes(t.id)) return 'That island has already paid out this turn.';
  const gap = shoreGap(s, t);
  if (G.players[s.owner].ships.some(o => o !== s && !isDead(o) && shoreGap(o, t) < gap - TOUCH_TOL)) return 'Another of your ships is nearer that island.';
  return null;
}

/** Islands ship s may Collect at right now. */
function collectIslands(s) { return islands().filter(t => !collectProblem(s, t)); }

// ─── Prizes ───────────────────────────────────────────
// Rulebook v0.6: a fitting knocked off an enemy ship goes to the player who
// knocked it off, and so does the hull of a ship they sink. Whenever a
// fitting or hull goes back on a ship (Repair, capture, Return from the
// Deep) it comes out of whichever pile holds it: the leader's, if several do.
// A captured ship sailing in your fleet counts as a prize hull too.

function takePrize(p, ship, kind) { (G.prizes ||= []).push({ p, ship: ship.id, kind }); }

const originOf = s => (s.origin != null ? s.origin : +String(s.id).match(/^p(\d+)/)[1]);

function prizesOf(p) {
  const out = { fittings: 0, hulls: 0 };
  for (const z of G.prizes || []) if (z.p === p) out[z.kind === 'hull' ? 'hulls' : 'fittings']++;
  for (const s of G.players[p].ships) if (originOf(s) !== p) out.hulls++;
  return out;
}

function returnPrize(ship, kind) {
  const L = G.prizes || [];
  const worth = p => { const z = prizesOf(p); return z.fittings * VP_PRIZE_FITTING + z.hulls * VP_PRIZE_HULL; };
  let best = -1;
  L.forEach((z, i) => { if (z.ship === ship.id && z.kind === kind && (best < 0 || worth(z.p) > worth(L[best].p))) best = i; });
  return best >= 0 ? L.splice(best, 1)[0] : null;
}

function scoreBreakdown() {
  const out = {};
  for (const p of G.order) {
    const ships = G.players[p].ships.length; // dead-in-the-water ships are still afloat
    const isl = islandsHeld(p), coins = coinTotal(p), pr = prizesOf(p);
    const hoard = coins * VP_COIN;
    out[p] = {
      ships, islands: isl, coins, fittings: pr.fittings, hulls: pr.hulls, hoard,
      base: isl * VP_ISLAND + pr.fittings * VP_PRIZE_FITTING + pr.hulls * VP_PRIZE_HULL + hoard, bonus: 0,
    };
  }
  // Most ships / most islands: every tied player gets the full +2.
  for (const k of ['ships', 'islands']) {
    const m = Math.max(...G.order.map(p => out[p][k]));
    for (const p of G.order) if (out[p][k] === m) out[p].bonus += VP_BONUS;
  }
  for (const p of G.order) out[p].total = out[p].base + out[p].bonus;
  return out;
}

function canDeclareVictory(p) {
  if (G.phase !== 'play' || G.active !== p || !G.coinPhase) return false;
  const s = scoreBreakdown();
  const best = Math.max(...opponents(p).map(q => s[q].total));
  return s[p].total >= VICTORY_POINTS && s[p].total >= best;
}

// ─── Turn flow ────────────────────────────────────────

const inGame = p => G.players[p].ships.length > 0;

function beginTurn() {
  const p = G.active;
  G.coinPhase = true;
  for (const s of G.players[p].ships) {
    s.acted = false; s.turnsLeft = 1; s.stage = 'action'; s.noAction = false;
    s.pending = null; s.gunner = false; s.shotsDone = 0; s.fullSail = 0;
  }
  // Stone Hulls: "the first hit it takes each turn", so it resets every turn.
  for (const s of allShips()) s.stoneUsed = false;
  G.turnStarted = true;
  G.collected = [];
  checkStalemate();
}

function nextSeat(p) {
  const i = G.order.indexOf(p);
  for (let k = 1; k <= G.order.length; k++) {
    const q = G.order[(i + k) % G.order.length];
    if (inGame(q)) return q;
  }
  return p;
}

function endTurnBookkeeping() {
  const p = G.active;
  for (const s of G.players[p].ships) { s.touchPrev = touchingIslands(s); s.pending = null; }
  G.turn++;
  G.active = nextSeat(p);
}

function checkStalemate() {
  if (G.phase !== 'play') return;
  const isl = islands();
  const living = G.order.filter(inGame).length;
  // Optional rule: every island flagged and no flag changed hands for two
  // full rounds.
  if (G.opts.stalemate && isl.length && isl.every(t => t.owner != null) && G.turn - G.lastFlagChange - 1 >= 2 * living) {
    endByScore('Stalemate: every island is held and none changed hands for two rounds.');
  } else if (G.turn > 120 * G.order.length) {
    endByScore('The tide ran out (turn limit).'); // safety net, not a tabletop rule
  }
}

function endByScore(reason) {
  const s = scoreBreakdown();
  const best = Math.max(...G.order.map(p => s[p].total));
  const top = G.order.filter(p => s[p].total === best);
  G.phase = 'over';
  G.winner = top.length === 1 ? top[0] : 0;
  G.endReason = reason;
}

function checkLastFleet() {
  if (G.phase !== 'play') return false;
  const alive = G.order.filter(inGame);
  if (alive.length > 1) return false;
  G.phase = 'over';
  G.winner = alive.length ? alive[0] : 0;
  G.endReason = 'Last fleet afloat.';
  return true;
}

// ─── Damage ───────────────────────────────────────────

// ─── Fittings aboard ──────────────────────────────────
// ship.fit is the count; ship.fitMask says which ones. The mask follows the
// count if something set the count directly.
function fitMaskOf(ship) {
  if (!Array.isArray(ship.fitMask) || ship.fitMask.length !== ship.maxFit) ship.fitMask = Array.from({ length: ship.maxFit }, (_, i) => i < ship.fit);
  const m = ship.fitMask;
  let n = m.filter(Boolean).length;
  while (n > ship.fit) { m[m.lastIndexOf(true)] = false; n--; }
  while (n < ship.fit) { m[m.indexOf(false)] = true; n++; }
  return m;
}
const turretIdx = ship => (ship.guns === 'industry' ? ship.maxFit - 1 : -1);
function hasTurret(ship) { const i = turretIdx(ship); return i >= 0 && fitMaskOf(ship)[i]; }
function presentFittings(ship) { return fitMaskOf(ship).map((v, i) => (v ? i : -1)).filter(i => i >= 0); }
function missingFittings(ship) { return fitMaskOf(ship).map((v, i) => (v ? -1 : i)).filter(i => i >= 0); }
// Fittings always come off in this order: turret, then cargo, then masts
// (or the Industry's smokestack). Repair puts them back in reverse.
const LOSS_RANK = { turret: 0, cargo: 1, mast: 2, stack: 2 };
function nextToLose(ship) {
  const lay = fittingLayout(ship);
  return presentFittings(ship).sort((a, b) => (LOSS_RANK[lay[a].kind] - LOSS_RANK[lay[b].kind]) || (b - a))[0];
}
function nextToRestore(ship) {
  const lay = fittingLayout(ship);
  return missingFittings(ship).sort((a, b) => (LOSS_RANK[lay[b].kind] - LOSS_RANK[lay[a].kind]) || (a - b))[0];
}
function loseFitting(ship, idx) { fitMaskOf(ship)[idx] = false; ship.fit--; ship.lastLost = idx; }
function gainFitting(ship, idx) { const m = fitMaskOf(ship); if (!m[idx]) { m[idx] = true; ship.fit++; } }
/** Leave the ship with exactly one fitting (captured or raised ships): the first a Repair would put back. */
function oneFitting(ship) {
  ship.fitMask = Array(ship.maxFit).fill(false); ship.fit = 0;
  gainFitting(ship, nextToRestore(ship));
}

/**
 * One hit on `ship` (cannonball or boarding party). Returns what happened:
 * 'stone' | 'brace' | 'fitting' | 'dead' | 'sunk'.
 * Order when both could apply: Stone Hulls first (free), then Brace, so the
 * brace coin is kept for a later hit.
 * Cannonball or boarding party, the fitting lost is always the next in
 * the loss order (see nextToLose).
 */
function applyHit(ship, by) {
  if (stoneShields(ship)) { ship.stoneUsed = true; return 'stone'; }
  if (ship.braced) { ship.braced = false; G.bag.push('brace'); return 'brace'; }
  // `by` is the seat that landed the hit: it takes the fitting or hull as a prize.
  const prize = typeof by === 'number' && by !== ship.owner;
  if (ship.fit > 0) {
    loseFitting(ship, nextToLose(ship));
    if (prize) takePrize(by, ship, 'fitting');
    return ship.fit === 0 ? 'dead' : 'fitting';
  }
  sinkShip(ship);
  if (prize) takePrize(by, ship, 'hull');
  return 'sunk';
}

function sinkShip(ship) {
  const list = G.players[ship.owner].ships;
  const i = list.indexOf(ship);
  if (i >= 0) list.splice(i, 1);
  ship.placed = false;
  G.players[ship.owner].sunk.push(ship);
}

// ─── Coins ────────────────────────────────────────────

function drawCoin(p) {
  if (!G.bag.length) return null;
  const id = G.bag.splice(Math.floor(rand() * G.bag.length), 1)[0];
  G.players[p].coins[id]++;
  return id;
}

function payCoin(p, id, keepOut) {
  if (G.players[p].coins[id] <= 0) return false;
  G.players[p].coins[id]--;
  if (!keepOut) G.bag.push(id);
  return true;
}

function setFlag(t, p) {
  if (t.owner !== p) { t.owner = p; G.lastFlagChange = G.turn; }
}
