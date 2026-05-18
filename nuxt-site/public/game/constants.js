// ═══════════════════════════════════════════════════════════════
// CANNONS & COASTLINES — constants.js
// World configuration, math utilities, data tables, and theme
// ═══════════════════════════════════════════════════════════════

// ─── World ─────────────────────────────────────────────
const WORLD_W = 10;
const WORLD_H = 10;

// ─── Game Rules ────────────────────────────────────────
const HAND_SIZE  = 3;   // coins held per turn
const P1 = 1, P2 = 2;
const VICTORY_MIN_TURN = 10; // earliest turn to declare victory

// ─── Ship Properties ──────────────────────────────────
const SHIP_RADIUS        = 0.35;
const SHIP_MOVE_RADIUS   = 1.15; // base move distance per click
const SHIP_FULL_SAIL     = 2.4;
const SHIP_EVASIVE_DIST  = 0.9;
const SHIP_ADJACENT_DIST = 1.3;
const SHIP_MIN_SEP       = 0.7;
const HIT_RADIUS         = 0.45;
const ISLAND_TOUCH_DIST  = 0.3;  // extra beyond island radius + ship radius

// ─── Zones ─────────────────────────────────────────────
const HOME_ZONE = {
  1: { yMin: WORLD_H - 2.2, yMax: WORLD_H - 0.3 },
  2: { yMin: 0.3,           yMax: 2.2 },
};
const TERRAIN_EXCL_Y = 2.2;

// ─── Math Utilities ────────────────────────────────────
function normAngle(a) {
  a = a % (Math.PI * 2);
  return a < 0 ? a + Math.PI * 2 : a;
}

function angleDelta(dx, dy) {
  return normAngle(Math.atan2(dx, -dy));
}

function rotVec(dx, dy, h) {
  const c = Math.cos(h), s = Math.sin(h);
  return { dx: c * dx - s * dy, dy: s * dx + c * dy };
}

function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

// ─── Cannon Slots & Firing Lanes ───────────────────────
// Cannons fire straight out from their slot. Each entry is in ship-local
// coordinates: ly negative is bow (forward), lx negative is port. `ang` is
// the firing direction in ship-local space (0 = forward, π/2 = starboard,
// π = stern, -π/2 = port). `range` is how far the cannonball travels.
const SHOT_RANGE = 5.5;
const SHOT_SCATTER = 0.35;

function getShipSlots(faction) {
  const passive = faction.passive;
  if (passive === 'forward_guns') {
    return [
      { lx: 0,                ly: -SHIP_RADIUS * 0.95, ang: 0,            label: 'Bow' },
      { lx: -SHIP_RADIUS * 0.4, ly: 0,                ang: -Math.PI / 2, label: 'Turret-P' },
      { lx:  SHIP_RADIUS * 0.4, ly: 0,                ang:  Math.PI / 2, label: 'Turret-S' },
    ];
  }
  if (passive === 'home_waters') {
    return [
      { lx: -SHIP_RADIUS * 0.5, ly:  SHIP_RADIUS * 0.85, ang: Math.PI, label: 'Aft-P' },
      { lx:  0,                 ly:  SHIP_RADIUS * 0.95, ang: Math.PI, label: 'Aft' },
      { lx:  SHIP_RADIUS * 0.5, ly:  SHIP_RADIUS * 0.85, ang: Math.PI, label: 'Aft-S' },
    ];
  }
  // Default: 3 broadside slots per side. Center fires perpendicular; fore slot
  // angles ~25° forward, aft slot ~25° aft.
  // `forwardness` rotates the lane toward the bow (positive) or stern (negative).
  const TILT = 25 * Math.PI / 180;
  const lanes = [
    { ly: -0.55 * SHIP_RADIUS, fwd:  TILT, label: 'fore' },
    { ly:  0,                  fwd:  0,    label: 'mid'  },
    { ly:  0.55 * SHIP_RADIUS, fwd: -TILT, label: 'aft'  },
  ];
  const out = [];
  for (const ln of lanes) {
    out.push({ lx: -SHIP_RADIUS, ly: ln.ly, ang: -Math.PI / 2 + ln.fwd, label: 'P-' + ln.label });
    out.push({ lx:  SHIP_RADIUS, ly: ln.ly, ang:  Math.PI / 2 - ln.fwd, label: 'S-' + ln.label });
  }
  return out;
}

/** World position + direction for a slot on a given ship. */
function slotWorld(ship, slot) {
  const pos = rotVec(slot.lx, slot.ly, ship.heading);
  // Local direction (sin(ang), -cos(ang)) maps 0 → (0, -1) i.e. forward.
  const dirLocal = { dx: Math.sin(slot.ang), dy: -Math.cos(slot.ang) };
  const dirWorld = rotVec(dirLocal.dx, dirLocal.dy, ship.heading);
  return { x: ship.x + pos.dx, y: ship.y + pos.dy, dx: dirWorld.dx, dy: dirWorld.dy };
}

// ─── Factions ──────────────────────────────────────────
// Each faction defines ship count, stats, and a passive ability.
// `masts` is the fitting count. Total hits to sink = fittings + 1
// (the +1 is the bare hull, which absorbs one hit while dead in the water).
// moveCount: number of clicks per Move action (rendered as concentric rings).
const FACTION_DEFS = {
  queens_fleet: {
    name: "Queen's Fleet",
    desc: 'Well-rounded baseline fleet',
    shipCount: 3,
    shipNames: ['Vanguard', 'Resolute', 'Defiance'],
    masts: 4,
    moveCount: 2,
    passive: 'disciplined_crew',
    passiveDesc: 'Disciplined Crew — Set Heading up to 180\u00B0 instead of 90\u00B0',
    accent: { hull: [140, 80, 50], sail: [210, 190, 160] },
  },
  corsairs: {
    name: 'Corsairs',
    desc: 'Fast hit-and-run raiders',
    shipCount: 4,
    shipNames: ['Black Tide', 'Sea Viper', 'Cutlass', 'Rogue Wave'],
    masts: 3,
    moveCount: 3,
    passive: 'plunder',
    passiveDesc: 'Plunder — draw 1 extra coin when boarding or capturing an island',
    accent: { hull: [50, 50, 50], sail: [30, 30, 30] },
  },
  treasure_fleet: {
    name: 'Treasure Fleet',
    desc: 'Economic powerhouse, few but rich ships',
    shipCount: 2,
    shipNames: ['Golden Junk', 'Jade Dragon'],
    masts: 3,
    moveCount: 1,
    passive: 'bountiful_harvest',
    passiveDesc: 'Bountiful Harvest — draw 2 coins instead of 1 when collecting from an island',
    accent: { hull: [160, 120, 40], sail: [200, 160, 80] },
  },
  sun_fleet: {
    name: 'Sun Fleet',
    desc: 'Heavy stone temple barges, brutally durable',
    shipCount: 3,
    shipNames: ['Obsidian Sun', 'Jade Altar', 'Stone Tide'],
    masts: 4,
    moveCount: 1,
    passive: 'stone_hulls',
    passiveDesc: 'Stone Hulls — first hit each turn is absorbed (resets at your turn start)',
    accent: { hull: [120, 110, 90], sail: [180, 170, 140] },
  },
  shadow_fleet: {
    name: 'Shadow Fleet',
    desc: 'Fragile but persistent ghost ships',
    shipCount: 3,
    shipNames: ['Wraith', 'Phantom', 'Revenant'],
    masts: 3,
    moveCount: 1,
    passive: 'return_from_deep',
    passiveDesc: 'Return from the Deep — spend 2 coins to revive a sunk ship at 1 HP on your island',
    accent: { hull: [70, 90, 100], sail: [140, 160, 180] },
  },
  industry: {
    name: 'The Industry',
    desc: 'Fast steam warships, forward-only cannons',
    shipCount: 3,
    shipNames: ['Ironclad', 'Dreadnought', 'Juggernaut'],
    masts: 3,
    moveCount: 2,
    passive: 'forward_guns',
    passiveDesc: 'Forward Guns — can only fire from the bow (bearing locked to Fore)',
    accent: { hull: [80, 80, 90], sail: [110, 110, 120] },
  },
  islanders: {
    name: 'The Islanders',
    desc: 'Lightning-fast skirmishers, rear-firing cannons',
    shipCount: 5,
    shipNames: ['Wavecutter', 'Tideskimmer', 'Reefrunner', 'Shellstrike', 'Driftfang'],
    masts: 2,
    moveCount: 3,
    passive: 'home_waters',
    passiveDesc: 'Home Waters — start with the nearest island already captured',
    accent: { hull: [100, 140, 80], sail: [150, 190, 130] },
  },
};

// ─── Coins ─────────────────────────────────────────────
const COIN_DEFS = {
  brace:          { name: 'Brace for Impact',  icon: '\uD83D\uDEE1\uFE0F', desc: 'Next hit on this ship is ignored',        free: false },
  signal_flags:   { name: 'Signal Flags',      icon: '\uD83D\uDEA9',       desc: 'Give ally a free move action',            free: true  },
  full_sail:      { name: 'Full Sail',         icon: '\u26F5',             desc: 'Two move actions this turn',              free: false },
  evasive:        { name: 'Evasive Maneuvers', icon: '\u2194\uFE0F',       desc: 'Slide one ship-width sideways',           free: false },
  skilled_gunner: { name: 'Skilled Gunner',    icon: '\uD83C\uDFAF',       desc: 'Fire twice from one ship',               free: false },
  repair_crew:    { name: 'Repair Crew',       icon: '\uD83D\uDD27',       desc: 'Restore 1 mast',                        free: false },
  boarding_party: { name: 'Boarding Party',    icon: '\u2694\uFE0F',       desc: 'Deal 1 hit to adjacent enemy',            free: false },
};
const ALL_COIN_IDS = Object.keys(COIN_DEFS);

const COIN_BAG_COMPOSITION = {
  brace: 5,
  signal_flags: 3,
  full_sail: 7,
  evasive: 6,
  skilled_gunner: 7,
  repair_crew: 7,
  boarding_party: 5,
};

// ─── Terrain ───────────────────────────────────────────
const TERRAIN_DEFS = {
  island:   { name: 'Island',   blocks: true,  color: '#3a7a3a', sand: '#c4a265' },
  rocks:    { name: 'Rocks',    blocks: true,  color: '#555'                      },
  reef:     { name: 'Reef',     blocks: false, color: 'rgba(160,120,60,.3)'       },
};

const TERRAIN_PRESETS = [
  { type: 'island', x: 3.0, y: 4.8, r: 0.65 },
  { type: 'island', x: 7.2, y: 5.5, r: 0.6  },
  { type: 'island', x: 5.0, y: 3.0, r: 0.55 },
  { type: 'rocks',  x: 1.8, y: 3.5, r: 0.4  },
  { type: 'rocks',  x: 8.2, y: 6.8, r: 0.4  },
  { type: 'reef',   x: 8.0, y: 4.0, r: 0.5  },
  { type: 'reef',   x: 2.0, y: 6.0, r: 0.5  },
];

// ─── Theme Colors ──────────────────────────────────────
const COLORS = {
  ocean_deep:      '#0d2a42',
  ocean_mid:       '#1a4a6e',
  wave_line:       'rgba(120,180,220,.06)',
  chart_line:      'rgba(200,220,240,.04)',
  chart_label:     'rgba(200,220,240,.12)',
  gold:            '#d4a853',
  gold_dim:        'rgba(212,168,83,.4)',
  p1_hull:         '#b03232',
  p1_sail:         '#dc5050',
  p1_banner:       'rgba(140,30,30,.85)',
  p2_hull:         '#3250b0',
  p2_sail:         '#5078dc',
  p2_banner:       'rgba(30,60,140,.85)',
  move_ring:       'rgba(46,204,113,.2)',
  move_ring_border:'rgba(46,204,113,.6)',
  smoke_trail:     'rgba(120,120,120,.3)',
  cannonball:      '#1a1a1a',
  terrain_sand:    '#c4a265',
};

// ─── Victory Points ────────────────────────────────────
const VP_SHIP   = 3;
const VP_ISLAND = 2;
const VP_COIN   = 1;
const VP_BONUS  = 2;
