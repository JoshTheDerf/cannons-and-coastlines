// ═══════════════════════════════════════════════════════════════
// CANNONS & COASTLINES — state.js
// Game state, spatial queries, validation, and turn management
// ═══════════════════════════════════════════════════════════════

// ─── Core State ────────────────────────────────────────
let G = null;
let stats = { 1: { shots: 0, hits: 0, shipsSunk: 0 }, 2: { shots: 0, hits: 0, shipsSunk: 0 } };

// ─── UI State (shared across modules) ──────────────────
let selectedShip    = null;
let actionMode      = null;   // null|'move'|'fire'|'coin'|'deploy'|'terrain_place'|'island'
let moveRings       = [];
let aimSide         = 0;
let aimBearing      = 2;
let aimElev         = 2;
let selectedCoin    = null;
let aimPreviewData  = null;
let deployFacing    = 0;
let selectedTerrainIdx = -1;

// ─── AI State ──────────────────────────────────────────
let aiControlled = { 1: false, 2: false };
let aiRunning    = false;

// ─── Faction Selection State ───────────────────────────
let factionChoice = { 1: 'queens_fleet', 2: 'corsairs' };

// ═══════════════════════════════════════════════════════════════
// COIN BAG
// ═══════════════════════════════════════════════════════════════

function shuffleCoinBag() {
  const bag = [];
  for (const [coinId, count] of Object.entries(COIN_BAG_COMPOSITION)) {
    for (let i = 0; i < count; i++) bag.push(coinId);
  }
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// ═══════════════════════════════════════════════════════════════
// GAME STATE CREATION
// ═══════════════════════════════════════════════════════════════

function createGameState(skipSetup) {
  const bag = shuffleCoinBag();

  function makeFleet(player) {
    const fid = factionChoice[player];
    const f = FACTION_DEFS[fid];
    const heading = player === 1 ? 0 : Math.PI;
    const ships = [];
    for (let i = 0; i < f.shipCount; i++) {
      const masts = f.mastsVary ? f.mastsVary[i] : f.masts;
      const hp = masts + 1;
      ships.push({
        id: `p${player}_s${i}`,
        x: -1, y: -1, heading,
        hp, maxHp: hp, masts, maxMasts: masts,
        hasActed: false, braced: false, signaled: false,
        stoneAbsorbed: false, // for Sun Fleet
        name: f.shipNames[i] || `Ship ${i + 1}`,
      });
    }
    return ships;
  }

  const state = {
    phase: skipSetup ? 'playing' : 'terrain',
    activePlayer: 1,
    factions: { 1: factionChoice[1], 2: factionChoice[2] },
    terrain: [],
    terrainPieces: skipSetup ? [] : [
      { type: 'island', r: 1.0  },
      { type: 'island', r: 0.9  },
      { type: 'island', r: 0.85 },
      { type: 'rocks',  r: 0.45 },
      { type: 'rocks',  r: 0.45 },
      { type: 'reef',   r: 0.5  },
      { type: 'reef',   r: 0.5  },
    ],
    islandOwner: {},  // key: terrain index → player (1|2) or undefined
    players: {
      1: {
        ships: makeFleet(1),
        hand: [bag.pop(), bag.pop(), bag.pop()],
        coins: 0,  // hoarded coins (for VP)
      },
      2: {
        ships: makeFleet(2),
        hand: [bag.pop(), bag.pop(), bag.pop()],
        coins: 0,
      },
    },
    bag,
    turn: 1,
    sunkShips: { 1: [], 2: [] },  // for Shadow Fleet revival
  };

  if (skipSetup) {
    state.terrain = TERRAIN_PRESETS.map(t => ({ type: t.type, x: t.x, y: t.y, r: t.r }));
    // Auto-deploy ships spread across home zone
    for (const p of [1, 2]) {
      const ships = state.players[p].ships;
      const zone = HOME_ZONE[p];
      const midY = (zone.yMin + zone.yMax) / 2;
      const spacing = Math.min(2.0, (WORLD_W - 2) / ships.length);
      const startX = (WORLD_W - spacing * (ships.length - 1)) / 2;
      ships.forEach((s, i) => {
        s.x = startX + i * spacing;
        s.y = midY + (Math.random() - 0.5) * 0.3;
      });
    }
    // Apply Home Waters passive for Islanders
    applyHomeWaters(state);
  }

  return state;
}

/** Islanders passive: capture the nearest island to their starting edge. */
function applyHomeWaters(state) {
  for (const p of [1, 2]) {
    if (state.factions[p] !== 'islanders') continue;
    const edgeY = p === 1 ? WORLD_H : 0;
    let closest = -1, closestDist = Infinity;
    state.terrain.forEach((t, i) => {
      if (t.type !== 'island') return;
      if (state.islandOwner[i] !== undefined) return;
      const d = Math.abs(t.y - edgeY);
      if (d < closestDist) { closestDist = d; closest = i; }
    });
    if (closest >= 0) state.islandOwner[closest] = p;
  }
}

// ═══════════════════════════════════════════════════════════════
// FACTION HELPERS
// ═══════════════════════════════════════════════════════════════

function getFaction(player) {
  return FACTION_DEFS[G.factions[player]];
}

function getPassive(player) {
  return getFaction(player).passive;
}

/** Get the move rings for a ship based on faction moveCount. */
function getMoveRings(player) {
  const mc = getFaction(player).moveCount;
  if (mc === 1) return [SHIP_MOVE_RADIUS];
  if (mc === 2) return [SHIP_MOVE_RADIUS, SHIP_MOVE_RADIUS * 1.7];
  // mc === 3
  return [SHIP_MOVE_RADIUS, SHIP_MOVE_RADIUS * 1.7, SHIP_MOVE_RADIUS * 2.4];
}

// ═══════════════════════════════════════════════════════════════
// ISLAND HELPERS
// ═══════════════════════════════════════════════════════════════

/** Check if a ship is touching an island. Returns terrain index or -1. */
function shipTouchingIsland(ship) {
  for (let i = 0; i < G.terrain.length; i++) {
    const t = G.terrain[i];
    if (t.type !== 'island') continue;
    if (dist(ship.x, ship.y, t.x, t.y) <= t.r + SHIP_RADIUS + ISLAND_TOUCH_DIST) return i;
  }
  return -1;
}

/** Count islands owned by a player. */
function islandsOwned(player) {
  let count = 0;
  for (const v of Object.values(G.islandOwner)) {
    if (v === player) count++;
  }
  return count;
}

/** Check if any enemy ship is also touching this island. */
function enemyContestingIsland(islandIdx, player) {
  const enemy = player === 1 ? 2 : 1;
  const t = G.terrain[islandIdx];
  return G.players[enemy].ships.some(s =>
    s.hp > 0 && dist(s.x, s.y, t.x, t.y) <= t.r + SHIP_RADIUS + ISLAND_TOUCH_DIST
  );
}

// ═══════════════════════════════════════════════════════════════
// VICTORY POINTS
// ═══════════════════════════════════════════════════════════════

function calcVP(player) {
  const living = livingShips(player).length;
  const islands = islandsOwned(player);
  const coins = G.players[player].coins;
  return living * VP_SHIP + islands * VP_ISLAND + coins * VP_COIN;
}

function calcFullVP(player) {
  const living = livingShips(player).length;
  const islands = islandsOwned(player);
  const coins = G.players[player].coins;
  const base = living * VP_SHIP + islands * VP_ISLAND + coins * VP_COIN;
  return { ships: living, islands, coins, base };
}

function calcBonuses() {
  const vp1 = calcFullVP(1), vp2 = calcFullVP(2);
  let bonus1 = 0, bonus2 = 0;
  // Most ships
  if (vp1.ships > vp2.ships) bonus1 += VP_BONUS;
  else if (vp2.ships > vp1.ships) bonus2 += VP_BONUS;
  else { bonus1 += VP_BONUS; bonus2 += VP_BONUS; }
  // Most islands
  if (vp1.islands > vp2.islands) bonus1 += VP_BONUS;
  else if (vp2.islands > vp1.islands) bonus2 += VP_BONUS;
  else { bonus1 += VP_BONUS; bonus2 += VP_BONUS; }
  // Most coins
  if (vp1.coins > vp2.coins) bonus1 += VP_BONUS;
  else if (vp2.coins > vp1.coins) bonus2 += VP_BONUS;
  else { bonus1 += VP_BONUS; bonus2 += VP_BONUS; }
  return {
    1: { ...vp1, bonus: bonus1, total: vp1.base + bonus1 },
    2: { ...vp2, bonus: bonus2, total: vp2.base + bonus2 },
  };
}

// ═══════════════════════════════════════════════════════════════
// SPATIAL QUERIES
// ═══════════════════════════════════════════════════════════════

function findShipNear(wx, wy, player, radius) {
  const r = radius || SHIP_RADIUS * 2;
  const players = player ? [player] : [1, 2];
  for (const p of players) {
    for (const s of G.players[p].ships) {
      if (s.hp <= 0 || s.x < 0) continue;
      if (dist(s.x, s.y, wx, wy) <= r) return { ship: s, player: p };
    }
  }
  return null;
}

function allShipsSunk(p) {
  return G.players[p].ships.every(s => s.hp <= 0);
}

function livingShips(p) {
  return G.players[p].ships.filter(s => s.hp > 0);
}

function terrainAt(wx, wy) {
  return G.terrain.find(t => dist(t.x, t.y, wx, wy) <= t.r);
}

function isBlockedAt(wx, wy) {
  const t = terrainAt(wx, wy);
  return t ? (TERRAIN_DEFS[t.type] && TERRAIN_DEFS[t.type].blocks) : false;
}

function inBounds(wx, wy) {
  return wx >= 0 && wx <= WORLD_W && wy >= 0 && wy <= WORLD_H;
}

// ═══════════════════════════════════════════════════════════════
// LINE-OF-SIGHT & PATH COLLISION
// ═══════════════════════════════════════════════════════════════

function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
  const dx = x2 - x1, dy = y2 - y1;
  const fx = x1 - cx, fy = y1 - cy;
  const a = dx * dx + dy * dy;
  if (a < 0.0001) return dist(x1, y1, cx, cy) < r;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return false;
  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
}

function pathClear(ax, ay, bx, by) {
  for (const t of G.terrain) {
    if (!TERRAIN_DEFS[t.type] || !TERRAIN_DEFS[t.type].blocks) continue;
    if (lineIntersectsCircle(ax, ay, bx, by, t.x, t.y, t.r + SHIP_RADIUS * 0.5)) return false;
  }
  return true;
}

function shotPathCheck(sx, sy, lx, ly) {
  let closest = null, closestT = Infinity;
  for (const t of G.terrain) {
    if (!TERRAIN_DEFS[t.type] || !TERRAIN_DEFS[t.type].blocks) continue;
    const dx = lx - sx, dy = ly - sy;
    const fx = sx - t.x, fy = sy - t.y;
    const a = dx * dx + dy * dy;
    if (a < 0.0001) continue;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - t.r * t.r;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    if (t1 > 0.05 && t1 < 1 && t1 < closestT) {
      closestT = t1;
      closest = { terrain: t, hitX: sx + dx * t1, hitY: sy + dy * t1 };
    }
  }
  return closest;
}

// ═══════════════════════════════════════════════════════════════
// MOVEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════

function canMoveTo(ship, tx, ty) {
  if (!inBounds(tx, ty)) return false;
  for (const t of G.terrain) {
    if (TERRAIN_DEFS[t.type] && TERRAIN_DEFS[t.type].blocks) {
      if (dist(tx, ty, t.x, t.y) < t.r + SHIP_RADIUS) return false;
    }
  }
  for (const p of [1, 2]) {
    for (const s of G.players[p].ships) {
      if (s.id === ship.id || s.hp <= 0 || s.x < 0) continue;
      if (dist(tx, ty, s.x, s.y) < SHIP_MIN_SEP) return false;
    }
  }
  if (ship.x >= 0 && !pathClear(ship.x, ship.y, tx, ty)) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════
// FIRING
// ═══════════════════════════════════════════════════════════════

function gaussRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function computeFiringSolution(ship, side, bearing, elev) {
  const base = FIRING_TABLE_PORT[`${bearing},${elev}`] || { dx: -3, dy: 0 };
  const mirrored = { dx: side === 1 ? -base.dx : base.dx, dy: base.dy };
  const offset = rotVec(mirrored.dx, mirrored.dy, ship.heading);
  const scatter = 0.25 + elev * 0.18;
  return {
    x: ship.x + offset.dx + gaussRandom() * scatter,
    y: ship.y + offset.dy + gaussRandom() * scatter,
  };
}

// ═══════════════════════════════════════════════════════════════
// TURN MANAGEMENT
// ═══════════════════════════════════════════════════════════════

function endTurn() {
  const ap = G.activePlayer;
  G.players[ap].ships.forEach(s => {
    s.hasActed = false;
    s.signaled = false;
  });
  // Draw coins from bag
  while (G.players[ap].hand.length < HAND_SIZE && G.bag.length > 0) {
    G.players[ap].hand.push(G.bag.pop());
  }
  if (G.bag.length < 5) G.bag = G.bag.concat(shuffleCoinBag());
  G.activePlayer = ap === 1 ? 2 : 1;
  G.turn++;
  // Reset Stone Hulls for the new active player's ships
  if (getPassive(G.activePlayer) === 'stone_hulls') {
    G.players[G.activePlayer].ships.forEach(s => { s.stoneAbsorbed = false; });
  }
  deselectAll();
}

function deselectAll() {
  selectedShip = null;
  actionMode = null;
  selectedCoin = null;
  aimPreviewData = null;
  moveRings = [];
}

// ═══════════════════════════════════════════════════════════════
// DEPLOYMENT VALIDATION
// ═══════════════════════════════════════════════════════════════

function canDeploy(x, y, player) {
  const z = HOME_ZONE[player];
  if (y < z.yMin || y > z.yMax) return false;
  if (!inBounds(x, y)) return false;
  if (isBlockedAt(x, y)) return false;
  for (const s of G.players[player].ships) {
    if (s.x >= 0 && dist(x, y, s.x, s.y) < SHIP_MIN_SEP) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════
// TERRAIN PLACEMENT VALIDATION
// ═══════════════════════════════════════════════════════════════

function canPlaceTerrainAt(x, y, r) {
  if (!inBounds(x, y)) return false;
  if (y < TERRAIN_EXCL_Y || y > WORLD_H - TERRAIN_EXCL_Y) return false;
  for (const t of G.terrain) {
    if (dist(x, y, t.x, t.y) < r + t.r + 0.2) return false;
  }
  return true;
}

function placeTerrainPiece(idx, x, y) {
  const piece = G.terrainPieces[idx];
  if (!piece || !canPlaceTerrainAt(x, y, piece.r)) return false;
  G.terrain.push({ type: piece.type, x, y, r: piece.r });
  G.terrainPieces.splice(idx, 1);
  G.activePlayer = G.activePlayer === 1 ? 2 : 1;
  selectedTerrainIdx = -1;
  if (G.terrainPieces.length === 0) {
    G.phase = 'deployment';
    G.activePlayer = 1;
  }
  return true;
}
