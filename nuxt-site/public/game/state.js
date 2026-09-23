// Cannons & Coastlines, digital edition: state.js
// Game state, setup, rule queries, damage, coins, scoring and turn order.
// Shared by the browser and the online game server (no DOM, no timing).
// All randomness goes through rand() (constants.js).

let G = null;

function makeShip(p, fid, i) {
  const f = FACTION_DEFS[fid];
  return {
    id: `p${p}s${i}`, owner: p, build: fid,
    name: f.names[i] || `Ship ${i + 1}`,
    len: f.len, wid: f.wid, guns: f.guns, moveCount: f.moveCount, hullStyle: f.hull,
    maxFit: f.fittings, fit: f.fittings,
    x: 0, y: 0, h: 0, placed: false,
    // A ship's turn (rulebook v0.5): one action (Set Heading, Fire, or an
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
 *         stalemate, table: 'rect'|'round' }
 * Seats are numbered 1..N in turn order.
 */
function newGame(opts) {
  const n = opts.seats.length;
  const bag = [];
  for (let k = 0; k < n; k++) for (const [id, c] of Object.entries(COIN_SET)) for (let i = 0; i < c; i++) bag.push(id);
  shuffle(bag);
  const emptyCoins = () => Object.fromEntries(COIN_ORDER.map(id => [id, 0]));
  const round = opts.table === 'round';
  G = {
    opts,
    phase: 'islands',
    order: opts.seats.map((_, i) => i + 1),
    active: 1,
    turn: 1,
    table: round ? { shape: 'circle', r: ROUND_R[n] || ROUND_R[7] } : { shape: 'rect', w: RECT_TABLE, h: RECT_TABLE },
    islandCount: ISLANDS_FOR[n] || 10,
    factions: {},
    terrain: [],
    players: {},
    bag,
    coinPhase: true,
    lastFlagChange: 0,
    winner: null, endReason: '',
    terrainPlaced: {},
    stats: {},
    ai: null,
  };
  opts.seats.forEach((s, i) => {
    const p = i + 1;
    G.factions[p] = s.faction;
    G.players[p] = { ships: [], coins: emptyCoins(), sunk: [], color: s.color != null ? s.color : i, name: s.name || `Player ${p}`, ai: !!s.ai };
    G.terrainPlaced[p] = 0;
    G.stats[p] = { shots: 0, hits: 0, sunk: 0 };
    const f = FACTION_DEFS[s.faction];
    for (let k = 0; k < f.shipCount; k++) G.players[p].ships.push(makeShip(p, s.faction, k));
  });
  if (opts.setup === 'quick') {
    randomIslands();
    randomTerrain(round ? Math.min(6, 2 + Math.ceil(n / 2)) : 4);
    for (const p of G.order) autoDeploy(p);
    applyHomeWaters();
    G.phase = 'play';
    beginTurn();
  }
  return G;
}

// ─── Setup ────────────────────────────────────────────

function islandSpotProblem(x, y, r) {
  if (edgeDist(x, y) - r < ISLAND_EDGE_MIN) return 'Islands stay 12" from every edge.';
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
  else if (y - r < DEPLOY_STRIP || y + r > G.table.h - DEPLOY_STRIP) return 'Keep the deployment edges clear.';
  for (const t of G.terrain) if (dist(x, y, t.x, t.y) - r - t.r < 2) return 'Too close to other terrain.';
  return null;
}

function addTerrain(type, x, y, r) {
  G.terrain.push({ type, x, y, r, owner: null, id: G.terrain.length });
}

function islandRadius() { return 5.5 + rand() * 2.5; }
function terrainRadius(type) { return type === 'rock' ? 2.8 + rand() * 1.2 : 3.1; }

function randomPointOnTable(margin) {
  const c = tableCenter(), sz = tableSize();
  for (let k = 0; k < 50; k++) {
    const x = margin + rand() * (sz.w - 2 * margin), y = margin + rand() * (sz.h - 2 * margin);
    if (edgeDist(x, y) >= margin) return { x, y };
  }
  return c;
}

function randomIslands() {
  const want = G.islandCount;
  const keep = () => G.terrain.filter(t => t.type !== 'island');
  for (let tries = 0; tries < 150; tries++) {
    G.terrain = keep();
    let placed = 0;
    for (let i = 0; i < want; i++) {
      for (let a = 0; a < 150; a++) {
        const r = islandRadius();
        const pt = randomPointOnTable(ISLAND_EDGE_MIN + r);
        if (!islandSpotProblem(pt.x, pt.y, r)) { addTerrain('island', pt.x, pt.y, r); placed++; break; }
      }
      if (placed <= i) break;
    }
    if (placed === want) break;
    // Crowded tables: fall back to a jittered ring layout.
    if (tries > 40) {
      G.terrain = keep();
      const c = tableCenter(), ring = want - 1;
      const span = (G.table.shape === 'circle' ? G.table.r : Math.min(G.table.w, G.table.h) / 2) - ISLAND_EDGE_MIN - 7;
      const off = rand() * TAU;
      addTerrain('island', c.x + (rand() - 0.5) * 3, c.y + (rand() - 0.5) * 3, 6);
      for (let k = 0; k < ring; k++) {
        const a = off + k * TAU / ring;
        addTerrain('island', c.x + Math.cos(a) * span * 0.97, c.y + Math.sin(a) * span * 0.97, 5.5 + rand() * 1.5);
      }
      const ok = G.terrain.filter(t => t.type === 'island').every((t, i, arr) =>
        edgeDist(t.x, t.y) - t.r >= ISLAND_EDGE_MIN - 0.01 && arr.every(o => o === t || dist(t.x, t.y, o.x, o.y) - t.r - o.r >= ISLAND_GAP_MIN - 0.01));
      if (ok) break;
    }
  }
  G.terrain.forEach((t, i) => { t.id = i; });
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

/** Where a seat's fleet lines up: a point on the rim and the inward heading. */
function seatHome(p) {
  if (G.table.shape === 'circle') {
    const k = G.order.indexOf(p), n = G.order.length;
    const a = Math.PI / 2 + k * TAU / n;
    const c = tableCenter();
    return { x: c.x + Math.cos(a) * G.table.r, y: c.y + Math.sin(a) * G.table.r, h: headingTo(-Math.cos(a), -Math.sin(a)), a };
  }
  return p === 1 ? { x: G.table.w / 2, y: G.table.h, h: 0 } : { x: G.table.w / 2, y: 0, h: Math.PI };
}

/** Pose for a ship lined up touching its owner's (rectangular) edge, facing inward. */
function deployPose(p, ship, x) {
  const H = G.table.h;
  const y = p === 1 ? H - ship.len / 2 - 0.02 : ship.len / 2 + 0.02;
  return { x: clamp(x, ship.wid / 2 + 0.05, G.table.w - ship.wid / 2 - 0.05), y, h: p === 1 ? 0 : Math.PI };
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
  const circle = G.table.shape === 'circle';
  const spacing = circle ? 17 : Math.min(22, (G.table.w - 20) / n);
  ships.forEach((s, i) => {
    const base = (i - (n - 1) / 2) * spacing;
    for (let k = 0; k < 40; k++) {
      const off = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 1.5;
      const pose = circle ? rimPose(p, s, off) : deployPose(p, s, G.table.w / 2 + off);
      if (canDeployAt(s, pose)) { Object.assign(s, pose); break; }
      if (k === 0) Object.assign(s, pose);
    }
    s.placed = true;
  });
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

function coinTotal(p) { return COIN_ORDER.reduce((n, id) => n + G.players[p].coins[id], 0); }
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

function scoreBreakdown() {
  const out = {};
  for (const p of G.order) {
    const ships = G.players[p].ships.length; // dead-in-the-water ships are still afloat
    const isl = islandsHeld(p), coins = coinTotal(p);
    out[p] = { ships, islands: isl, coins, base: ships * VP_SHIP + isl * VP_ISLAND + coins * VP_COIN, bonus: 0 };
  }
  // Most ships / islands / coins: every tied player gets the full +2.
  for (const k of ['ships', 'islands', 'coins']) {
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
    s.pending = null; s.gunner = false; s.shotsDone = 0;
  }
  // Stone Hulls: "the first hit it takes each turn", so it resets every turn.
  for (const s of allShips()) s.stoneUsed = false;
  G.turnStarted = true;
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

/**
 * One hit on `ship` (cannonball or boarding party). Returns what happened:
 * 'stone' | 'brace' | 'fitting' | 'dead' | 'sunk'.
 * Order when both could apply: Stone Hulls first (free), then Brace, so the
 * brace coin is kept for a later hit.
 */
function applyHit(ship) {
  if (passiveOf(ship.owner) === 'stone' && !ship.stoneUsed) { ship.stoneUsed = true; return 'stone'; }
  if (ship.braced) { ship.braced = false; G.bag.push('brace'); return 'brace'; }
  if (ship.fit > 0) {
    // Which fitting comes off is the owner's pick at the table. The digital
    // owner always pulls hull fittings first, so an Industry turret is the
    // last fitting to go.
    ship.fit--;
    return ship.fit === 0 ? 'dead' : 'fitting';
  }
  sinkShip(ship);
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
