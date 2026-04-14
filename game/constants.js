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
const SHIP_MOVE_RADIUS   = 1.8;  // base move distance per roll
const SHIP_FULL_SAIL     = 3.5;
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

// ─── Broadside Aiming System ───────────────────────────
const SIDE_LABELS    = ['Port', 'Starboard'];
const BEARING_LABELS = ['Fore', 'Fore-Mid', 'Abeam', 'Aft-Mid', 'Aft'];
const ELEV_LABELS    = ['Flat', 'Low Arc', 'Medium', 'High Arc', 'Steep Lob'];

const FIRING_TABLE_PORT = {};
(function buildFiringTable() {
  const lateralRange = [0.8, 1.6, 2.8, 4.5, 6.2];
  const bearingShift = [-0.8, -0.4, 0, 0.4, 0.8];
  for (let b = 0; b < 5; b++) {
    for (let e = 0; e < 5; e++) {
      const range = lateralRange[e];
      FIRING_TABLE_PORT[`${b},${e}`] = {
        dx: -range,
        dy: bearingShift[b] * range,
      };
    }
  }
})();

// ─── Factions ──────────────────────────────────────────
// Each faction defines ship count, stats, and a passive ability.
// HP = masts + 1 (the +1 is the hull itself).
// moveCount: how many rolls per Move action (translated to concentric rings).
const FACTION_DEFS = {
  queens_fleet: {
    name: "Queen's Fleet",
    desc: 'Well-rounded baseline fleet',
    shipCount: 3,
    shipNames: ['Vanguard', 'Resolute', 'Defiance'],
    masts: 3,  // HP = 4
    moveCount: 1,
    passive: 'disciplined_crew',
    passiveDesc: 'Disciplined Crew — may rotate 180\u00B0 before moving (free)',
    accent: { hull: [140, 80, 50], sail: [210, 190, 160] },
  },
  corsairs: {
    name: 'Corsairs',
    desc: 'Fast hit-and-run raiders',
    shipCount: 4,
    shipNames: ['Black Tide', 'Sea Viper', 'Cutlass', 'Rogue Wave'],
    masts: 2,  // HP = 3
    moveCount: 2,
    passive: 'plunder',
    passiveDesc: 'Plunder — draw 1 extra coin when boarding or capturing an island',
    accent: { hull: [50, 50, 50], sail: [30, 30, 30] },
  },
  treasure_fleet: {
    name: 'Treasure Fleet',
    desc: 'Economic powerhouse, few but rich ships',
    shipCount: 2,
    shipNames: ['Golden Junk', 'Jade Dragon'],
    masts: 2,  // HP = 3
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
    mastsVary: [2, 3, 4],  // small/medium/large → HP 3/4/5
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
    masts: 2,  // HP = 3
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
    masts: 3,  // HP = 4 (smokestacks)
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
    masts: 1,  // HP = 2
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
  { type: 'island', x: 3.0, y: 4.8, r: 1.0  },
  { type: 'island', x: 7.2, y: 5.5, r: 0.95 },
  { type: 'island', x: 5.0, y: 3.0, r: 0.85 },
  { type: 'rocks',  x: 1.8, y: 3.5, r: 0.45 },
  { type: 'rocks',  x: 8.2, y: 6.8, r: 0.45 },
  { type: 'reef',   x: 8.0, y: 4.0, r: 0.55 },
  { type: 'reef',   x: 2.0, y: 6.0, r: 0.55 },
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
