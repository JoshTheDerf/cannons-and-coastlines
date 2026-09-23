// Cannons & Coastlines, digital edition: constants.js
// Table scale, faction data, coins and small math helpers.
//
// World units are centimetres on a real table. Sizes come from the printed
// parts in assets/stls/base-set (ship hulls ~12-13 cm long, ~3.6 cm wide,
// movement wheel ~14 mm across, so one click is ~4.5 cm).

// Tables. Local games use a 4 x 4 ft table: the rulebook asks for islands
// 12" from every edge and 6" apart, which does not fit four islands on a
// 3 ft table. Online games use a round table sized so every fleet fits
// along the rim and the rulebook's island count fits inside.
const RECT_TABLE = 122;
const INCH = 2.54;
const ROUND_R = { 2: 66, 3: 76, 4: 78, 5: 84, 6: 90, 7: 100 };
const ISLANDS_FOR = { 2: 4, 3: 6, 4: 6, 5: 8, 6: 8, 7: 10 };  // rulebook setup table (7 = group-size table)
const MAX_SEATS = 7;

// Movement
const CLICK_LEN = 4.5;          // one wheel revolution
const TOUCH_TOL = 0.5;          // gap (cm) that still counts as "touching"
const COLLIDE_EPS = 0.01;

// Islands and terrain
const ISLAND_EDGE_MIN = 12 * INCH;   // island edge to table edge
const ISLAND_GAP_MIN = 6 * INCH;     // island edge to island edge
const TERRAIN_DEFS = {
  island: { name: 'Island', height: 8.0 },
  rock:   { name: 'Rock',   height: 5.0 },
  reef:   { name: 'Reef',   height: 1.5 },
};

// Cannon model. The ball flies in a low arc to a landing point set by the
// shot's power, then rolls a little. It can touch anything whose top is
// above the ball: hulls near the muzzle and near the landing point, taller
// terrain almost everywhere. The first thing it touches stops it.
const BALL_R = 0.5;
const HULL_H = 3.0;
const RANGE_MIN = 8;
const RANGE_MAX = 55;
const APEX_K = 0.18;        // apex height as a fraction of flight distance
const ROLL_K = 0.12;        // roll after landing, fraction of flight distance
const SHOT_ANGLE_SD = 1.2 * Math.PI / 180;   // cannon wobble
const SHOT_RANGE_SD = 0.05;                   // spring force wobble
const BOUNCE_SD = 14 * Math.PI / 180;         // the ball kicks sideways when it lands
const SLOT_SPLAY = 15 * Math.PI / 180;   // end slots angle toward their nearest end or side
const POWER_PERIOD = 2.4;   // seconds for the power marker to go out and back

// Scoring
const VP_SHIP = 3, VP_ISLAND = 2, VP_COIN = 1, VP_BONUS = 2;
const VICTORY_POINTS = 25;

// Factions. Stats are from rulebook/typst/factions.typ.
// guns: 'broadside' = 3 slots per side, 'industry' = bow + turret,
// 'stern' = 3 rear-facing slots.
// Treasure Fleet, Sun Fleet and Shadow Fleet cards list no cannon slots, so
// they use the standard broadside layout of the base-game hulls.
const FACTION_DEFS = {
  queens_fleet: {
    name: "Queen's Fleet", shipCount: 3, fittings: 4, moveCount: 3, pivot: 180,
    guns: 'broadside', len: 13.4, wid: 3.6, hull: 'frigate',
    names: ['Vanguard', 'Resolute', 'Defiance'],
    passive: 'disciplined', passiveName: 'Disciplined Crew',
    passiveText: 'Set Heading up to 180\u00B0 instead of 90\u00B0.',
    blurb: 'Balanced and forgiving. A good first pick.',
    hullColor: [96, 110, 128], base: true,
  },
  corsairs: {
    name: 'Corsairs', shipCount: 3, fittings: 3, moveCount: 4, pivot: 90,
    guns: 'broadside', len: 11.9, wid: 3.6, hull: 'sloop',
    names: ['Black Tide', 'Sea Viper', 'Cutlass'],
    passive: 'plunder', passiveName: 'Plunder',
    passiveText: 'Draw 1 extra coin on every successful board or island capture.',
    blurb: 'Fast raiders with thinner hulls.',
    hullColor: [44, 40, 38], base: true,
  },
  treasure_fleet: {
    name: 'Treasure Fleet', shipCount: 2, fittings: 3, moveCount: 2, pivot: 90,
    guns: 'broadside', len: 14.0, wid: 4.4, hull: 'junk',
    names: ['Golden Junk', 'Jade Dragon'],
    passive: 'harvest', passiveName: 'Bountiful Harvest',
    passiveText: 'Collect draws 2 coins instead of 1.',
    blurb: 'Two ships. Every island pays double.',
    hullColor: [150, 108, 40],
  },
  sun_fleet: {
    name: 'Sun Fleet', shipCount: 3, fittings: 4, moveCount: 2, pivot: 90,
    guns: 'broadside', len: 13.0, wid: 4.4, hull: 'barge',
    names: ['Obsidian Sun', 'Jade Altar', 'Stone Tide'],
    passive: 'stone', passiveName: 'Stone Hulls',
    passiveText: 'Each ship ignores the first hit it takes each turn.',
    blurb: 'Slow, and very hard to chip at.',
    hullColor: [128, 120, 100],
  },
  shadow_fleet: {
    name: 'Shadow Fleet', shipCount: 3, fittings: 3, moveCount: 3, pivot: 90,
    guns: 'broadside', len: 13.0, wid: 3.8, hull: 'galleon',
    names: ['Wraith', 'Phantom', 'Revenant'],
    passive: 'deep', passiveName: 'Return from the Deep',
    passiveText: 'Spend 2 coins to raise a sunk ship with 1 fitting at an island you hold.',
    blurb: 'Average ships that come back.',
    hullColor: [60, 50, 72],
  },
  industry: {
    name: 'The Industry', shipCount: 3, fittings: 3, moveCount: 3, pivot: 90,
    guns: 'industry', len: 12.5, wid: 3.8, hull: 'steam',
    names: ['Ironclad', 'Dreadnought', 'Juggernaut'],
    passive: 'turret', passiveName: 'Rotating Turret',
    passiveText: 'Bow gun fires forward. The turret is a fitting that turns to fire any way. Shot off, it stays silent until repaired.',
    blurb: 'Iron steamers with a bow gun and a turret.',
    hullColor: [84, 84, 92],
  },
  islanders: {
    name: 'The Islanders', shipCount: 5, fittings: 1, moveCount: 4, pivot: 90,
    guns: 'stern', len: 10.0, wid: 4.2, hull: 'cat',
    names: ['Wavecutter', 'Tideskimmer', 'Reefrunner', 'Shellstrike', 'Driftfang'],
    passive: 'home', passiveName: 'Home Waters',
    passiveText: 'Start with the nearest island flagged and one catamaran touching it.',
    blurb: 'Five fast catamarans. One hit each. Guns face the stern.',
    hullColor: [70, 110, 70],
  },
};
const FACTION_ORDER = ['queens_fleet', 'corsairs', 'treasure_fleet', 'sun_fleet', 'shadow_fleet', 'industry', 'islanders'];

// Coins (rulebook v0.5). Each player adds 20 to the bag.
const COIN_DEFS = {
  brace:    { name: 'Brace for Impact',  short: 'Brace',    icon: '\uD83D\uDEE1\uFE0F', text: 'Put it on one of your ships. The next hit that ship takes is ignored.' },
  signal:   { name: 'Signal Flags',      short: 'Signal',   icon: '\uD83D\uDEA9', text: 'One of your ships gives up its action and only sails forward. Another of your ships takes two full turns.' },
  evasive:  { name: 'Evasive Maneuvers', short: 'Evasive',  icon: '\u2194\uFE0F', text: 'One of your ships slides one ship-width to port or starboard, on top of its turn.' },
  gunner:   { name: 'Skilled Gunner',    short: 'Gunner',   icon: '\uD83C\uDFAF', text: 'One of your ships fires twice this turn, both before it sails on.' },
  repair:   { name: 'Repair Crew',       short: 'Repair',   icon: '\uD83D\uDD27', text: 'Restore 1 fitting. A dead ship needs another of your ships touching it.' },
  boarding: { name: 'Boarding Party',    short: 'Boarding', icon: '\u2694\uFE0F', text: 'Remove 1 fitting from an enemy ship touching yours. With Repair, capture a dead one.' },
};
const COIN_ORDER = ['brace', 'signal', 'evasive', 'gunner', 'repair', 'boarding'];
// Coin renders shared with the site (same origin).
const COIN_IMG = {
  brace: 'coin-brace-for-impact', signal: 'coin-signal-flag', evasive: 'coin-evasive-maneuver',
  gunner: 'coin-skilled-gunner', repair: 'coin-repair-crew', boarding: 'coin-boarding-party',
};
for (const id of COIN_ORDER) COIN_DEFS[id].img = `../assets/images/coins/${COIN_IMG[id]}.webp`;
const COIN_SET = { brace: 4, signal: 2, evasive: 2, gunner: 4, repair: 4, boarding: 4 };
const RULES_VERSION = 'v0.5';

// Fleet colours. Seats pick one each in an online lobby; local games use
// red for player 1 and blue for player 2.
const PALETTE = [
  { name: 'Red',    main: '#d24a3c', light: '#f08070', dark: '#8b1a1a', rgb: [210, 74, 60] },
  { name: 'Blue',   main: '#3f7fd8', light: '#86b4f0', dark: '#1f3a6a', rgb: [63, 127, 216] },
  { name: 'Green',  main: '#3c9a4c', light: '#80cc8c', dark: '#1d5a28', rgb: [60, 154, 76] },
  { name: 'Gold',   main: '#d1a01c', light: '#f0cc6a', dark: '#7a5a08', rgb: [209, 160, 28] },
  { name: 'Purple', main: '#8f58c8', light: '#c09ae8', dark: '#4a2470', rgb: [143, 88, 200] },
  { name: 'Teal',   main: '#1f9e9a', light: '#72d4d0', dark: '#0e5654', rgb: [31, 158, 154] },
  { name: 'Orange', main: '#e27a2a', light: '#f4b078', dark: '#8a4210', rgb: [226, 122, 42] },
];
function colorOf(p) {
  const pl = typeof G !== 'undefined' && G && G.players[p];
  return PALETTE[pl && pl.color != null ? pl.color : (p - 1) % PALETTE.length];
}

// Math helpers. Heading h: 0 = up the screen, clockwise positive.
// Forward vector (sin h, -cos h); starboard vector (cos h, sin h).
const TAU = Math.PI * 2;
function normAngle(a) { a %= TAU; return a < 0 ? a + TAU : a; }
function angleDiff(a, b) { let d = normAngle(a - b); if (d > Math.PI) d -= TAU; return d; }
function fwdVec(h) { return { x: Math.sin(h), y: -Math.cos(h) }; }
function stbVec(h) { return { x: Math.cos(h), y: Math.sin(h) }; }
function headingTo(dx, dy) { return normAngle(Math.atan2(dx, -dy)); }
function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
// All rule randomness goes through rand(). The online server swaps in a
// seeded generator so results come from the server, never the client.
let rand = Math.random;
function setRand(fn) { rand = fn || Math.random; }
function seededRandom(seed) {
  let a = seed >>> 0;
  const fn = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  fn.state = () => a;
  return fn;
}
function gaussRandom() {
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Speed multiplier for animations and AI pauses (?speed=4 for testing).
const GAME_SPEED = (() => {
  try { const v = parseFloat(new URLSearchParams(location.search).get('speed')); return v > 0 ? v : 1; }
  catch (e) { return 1; }
})();
function sleep(ms) { return new Promise(r => setTimeout(r, ms / GAME_SPEED)); }
