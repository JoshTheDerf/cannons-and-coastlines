// Cannons & Coastlines, digital edition: constants.js
// Table scale, faction data, coins and small math helpers.
//
// World units are centimetres on a real table. Sizes come from the printed
// parts in assets/stls/base-set (ship hulls ~12-13 cm long, ~3.6 cm wide,
// movement wheel ~14 mm across, so one click is ~4.5 cm).

// Tables are real furniture (TABLES below), the common ones being a 6 ft
// round and 6 ft and 8 ft folding tables. Online games use the 6 ft round,
// two players a quarter of the way round from each other rather than
// opposite (6 ft apart, it took most of the game to meet). Local games use
// the 6 ft folding table, two players diagonal across it. 'rect', a 4 ft
// square, is kept for older saved games.
const RECT_TABLE = 122;
const INCH = 2.54;
const ROUND_FOR = { 2: 'round6', 3: 'round6', 4: 'round6', 5: 'round6', 6: 'round6', 7: 'round6' };
const ISLANDS_FOR = { 2: 4, 3: 6, 4: 6, 5: 8, 6: 8, 7: 10 };  // rulebook setup table (7 = group-size table)
const MAX_SEATS = 7;
// Real tables, the sizes people have to hand (a church hall's folding
// tables are 30 in wide). Used by the balance tests; a local game could
// offer them too. Rectangular tables seat fleets around their edges.
const TABLES = {
  round4: { name: '48 in round', shape: 'circle', r: 48 * INCH / 2 },
  round5: { name: '60 in round', shape: 'circle', r: 60 * INCH / 2 },
  round6: { name: '6 ft round', shape: 'circle', r: 72 * INCH / 2 },
  fold6: { name: '6 ft folding', shape: 'rect', w: 72 * INCH, h: 30 * INCH },
  fold8: { name: '8 ft folding', shape: 'rect', w: 96 * INCH, h: 30 * INCH },
  dining: { name: 'Dining table', shape: 'rect', w: 72 * INCH, h: 38 * INCH },
};

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

// Cannon model, after the printed spring cannons. A cannon has two
// elevations, straight out or tipped up about 30 degrees, and no real
// control over power: the spring gives what it gives. It rarely fires
// dead straight either, spraying up to 5 degrees either side (straight
// ahead most often). The ball then does most of its work on the table:
// straight out it drops a hand's width from the muzzle, skips and rolls;
// tipped up it sails over nearby hulls, lands about 38 cm out and bounces.
// Straight out a shot carries 30-45 cm in all, tipped up 50-70 cm.
// The printed ball is tapered (10 mm wide, 13 mm long, a ~22 degree cone),
// so it cannot roll straight: a cone rolls in circles about its tip. Once
// the bounces die out it skids and tumbles, losing speed fast and curling
// off to whichever side its point faces, more tightly as it slows. Every
// bounce knocks it a little sideways too. It touches anything whose top is
// above the ball, and the first thing it touches stops it.
const BALL_R = 0.5;
const HULL_H = 3.0;
const GRAVITY = 981;                 // cm/s^2
const MUZZLE_H = 2.4;                // ball height at the muzzle
const MUZZLE_V = 198;                // cm/s: a lofted shot lands ~38 cm out
const MUZZLE_V_SD = 0.07;            // spring-to-spring and shot-to-shot variation
const ELEVATIONS = { flat: 0, lob: 30 * Math.PI / 180 };
const SPREAD_MAX = 5 * Math.PI / 180;        // side-to-side cone, straight ahead most likely
const BOUNCE_E = 0.35;               // vertical speed kept by a bounce
const BOUNCE_KEEP = 0.75;           // forward speed kept by a bounce
// Sideways knock at each bounce: the first landing is fairly true, after
// that the tapered ball goes where it likes.
const BOUNCE_KICK_SD = [3, 9, 14, 14].map(d => d * Math.PI / 180);
// Spin from each bounce (the cone is heavy at its wide end), in radians of
// turn per cm travelled; it bends the hops after it and fades in the skid.
const SPIN_SD = 0.9 * Math.PI / 180;
const SPIN_SKID_KEEP = 0.9;             // spin kept per 1.5 cm of skid
const TUMBLE_SD = 20 * Math.PI / 180;        // the turn it takes as it drops into a skid
const HOP_MIN_VZ = 20;               // slower than this off the table and it just skids
const SKID_DECEL = 450;              // cm/s^2: a tumbling cone scrubs speed fast
const SKID_DECEL_SD = 0.3;           // tables and landings vary
const SKID_CURL = 1.3;              // how hard it curls: radians per cm, times cm/s of speed
const SKID_CURL_V = 30;              // ...so the curl tightens as it slows
// Distances the computer and the aiming lines treat as in range: past
// RANGE_MAX the spread makes a hit unlikely, though a ball can roll on.
const RANGE_MIN = 2;
const RANGE_MAX = 55;
const SLOT_SPLAY = 15 * Math.PI / 180;   // end slots angle toward their nearest end or side
// The Industry turret turns any way but two: the smokestack and bow block
// it straight ahead, the stern works block it straight back. Blind cones
// this far either side of the bow and of the stern.
const TURRET_BLIND = 10 * Math.PI / 180;

// Scoring (rulebook v0.6). Surviving ships and coins do not score: points
// come from islands held and prizes, the fittings and hulls you knock off
// enemy ships. The Treasure Fleet alone still scores its unspent coins.
const VP_ISLAND = 2, VP_PRIZE_FITTING = 1, VP_PRIZE_HULL = 2, VP_TREASURE_COIN = 1, VP_BONUS = 2;
const VICTORY_POINTS = 12;

// Factions. Stats are from rulebook/typst/factions.typ.
// guns: 'broadside' = 3 slots per side, 'industry' = bow + turret,
// 'stern' = 3 rear-facing slots.
// Treasure Fleet, Stone Fleet and Shadow Fleet cards list no cannon slots, so
// they use the standard broadside layout of the base-game hulls.
const FACTION_DEFS = {
  queens_fleet: {
    name: "Queen's Fleet", shipCount: 3, fittings: 4, moveCount: 3, pivot: 180,
    guns: 'broadside', len: 13.4, wid: 3.6, hull: 'frigate',
    names: {
      forms: ['{v}', '{v}', 'Royal {n}', "Queen's {n}"],
      v: ['Vanguard', 'Resolute', 'Defiance', 'Valiant', 'Steadfast', 'Dauntless', 'Intrepid', 'Formidable', 'Sovereign', 'Vigilant', 'Illustrious', 'Invincible', 'Endeavour', 'Triumph'],
      n: ['Oak', 'Crown', 'Lion', 'Standard', 'Charter', 'Sceptre', 'Herald', 'Guardian', 'Rose', 'Albion'],
    },
    passive: 'disciplined', passiveName: 'Disciplined Crew',
    passiveText: 'Set Heading up to 180\u00B0 instead of 90\u00B0.',
    blurb: 'Balanced and forgiving. A good first pick.',
    hullColor: [96, 110, 128], base: true,
  },
  corsairs: {
    name: 'Corsairs', shipCount: 3, fittings: 3, moveCount: 4, pivot: 90,
    guns: 'broadside', len: 11.9, wid: 3.6, hull: 'sloop',
    names: {
      forms: ['{a} {n}', '{a} {n}', "{o}'s {t}"],
      a: ['Black', 'Red', 'Salt', 'Crimson', 'Rotten', 'Grim', 'Rusty', 'Mad', 'Sly', 'Wicked'],
      n: ['Tide', 'Viper', 'Gull', 'Jackal', 'Cutlass', 'Kraken', 'Shark', 'Wolf', 'Raven', 'Hook', 'Barracuda'],
      o: ['Widow', 'Devil', 'Rogue', 'Beggar', 'Gambler', 'Mutineer'],
      t: ['Revenge', 'Fortune', 'Folly', 'Grin', 'Luck', 'Bargain', 'Ransom'],
    },
    passive: 'plunder', passiveName: 'Plunder',
    passiveText: 'Draw 1 extra coin on every successful board or island capture.',
    blurb: 'Fast raiders with thinner hulls.',
    hullColor: [44, 40, 38], base: true,
  },
  treasure_fleet: {
    name: 'Treasure Fleet', shipCount: 2, fittings: 3, moveCount: 2, pivot: 90,
    guns: 'broadside', len: 14.0, wid: 4.4, hull: 'junk',
    names: {
      forms: ['{a} {b}'],
      a: ['Golden', 'Jade', 'Silver', 'Pearl', 'Amber', 'Lotus', 'Silk', 'Imperial', 'Jewel', 'Scarlet'],
      b: ['Dragon', 'Junk', 'Phoenix', 'Lantern', 'Tiger', 'Crane', 'Harvest', 'Moon', 'Tortoise', 'Carp'],
    },
    passive: 'harvest', passiveName: 'Bountiful Harvest',
    passiveText: 'Collect draws 2 coins instead of 1, and unspent coins score a point each.',
    blurb: 'Two ships. Every island pays double.',
    hullColor: [150, 108, 40],
  },
  stone_fleet: {
    name: 'Stone Fleet', shipCount: 3, fittings: 4, moveCount: 2, pivot: 90,
    guns: 'broadside', len: 13.0, wid: 4.4, hull: 'barge',
    names: {
      forms: ['{a} {b}'],
      a: ['Obsidian', 'Jade', 'Basalt', 'Granite', 'Flint', 'Serpent', 'Jaguar', 'Onyx', 'Marble', 'Slate'],
      b: ['Altar', 'Tide', 'Temple', 'Idol', 'Pyramid', 'Colossus', 'Throne', 'Monolith', 'Cairn', 'Menhir'],
    },
    passive: 'stone', passiveName: 'Stone Hulls',
    passiveText: 'Each ship ignores the first hit it takes each turn, unless it is touching an island.',
    blurb: 'Slow, and very hard to chip at.',
    hullColor: [128, 120, 100],
  },
  shadow_fleet: {
    name: 'Shadow Fleet', shipCount: 3, fittings: 3, moveCount: 3, pivot: 90,
    guns: 'broadside', len: 13.0, wid: 3.8, hull: 'galleon',
    names: {
      forms: ['{v}', '{a} {b}', '{a} {b}'],
      v: ['Wraith', 'Phantom', 'Revenant', 'Spectre', 'Banshee', 'Shade', 'Haunt', 'Wisp'],
      a: ['Drowned', 'Hollow', 'Silent', 'Grey', 'Pale', 'Lost', 'Sunken', 'Forgotten'],
      b: ['Maiden', 'Crown', 'Lantern', 'Bell', 'Mariner', 'Widow', 'Promise', 'Anchor'],
    },
    passive: 'deep', passiveName: 'Return from the Deep',
    passiveText: 'Spend 2 coins to raise a sunk ship with 1 fitting at an island you hold.',
    blurb: 'Average ships that come back.',
    hullColor: [60, 50, 72],
  },
  industry: {
    name: 'The Industry', shipCount: 3, fittings: 3, moveCount: 3, pivot: 90,
    guns: 'industry', len: 12.5, wid: 3.8, hull: 'steam',
    names: {
      forms: ['{v}', '{a} {b}', '{a} {b}'],
      v: ['Ironclad', 'Dreadnought', 'Juggernaut', 'Monitor', 'Leviathan', 'Vulcan', 'Titan', 'Colossus'],
      a: ['Iron', 'Steel', 'Brass', 'Coal', 'Steam', 'Rivet', 'Boiler', 'Furnace'],
      b: ['Duke', 'Hammer', 'Anvil', 'Engine', 'Piston', 'Baron', 'Magnate', 'Works'],
    },
    passive: 'turret', passiveName: 'Rotating Turret',
    passiveText: 'Bow gun fires forward. The turret is a fitting that turns to fire any way. Shot off, it stays silent until repaired.',
    blurb: 'Iron steamers with a bow gun and a turret.',
    hullColor: [84, 84, 92],
  },
  islanders: {
    name: 'The Islanders', shipCount: 5, fittings: 1, moveCount: 4, pivot: 90,
    guns: 'stern', len: 10.0, wid: 4.2, hull: 'cat',
    names: {
      forms: ['{a}{b}'],
      a: ['Wave', 'Tide', 'Reef', 'Shell', 'Drift', 'Salt', 'Coral', 'Palm', 'Spray', 'Gull', 'Surf', 'Sand'],
      b: ['cutter', 'skimmer', 'runner', 'strike', 'fang', 'dancer', 'rider', 'song', 'glider', 'darter'],
    },
    passive: 'home', passiveName: 'Home Waters',
    passiveText: 'Start with the nearest island flagged and one catamaran touching it.',
    blurb: 'Five fast catamarans. One hit each. Guns face the stern.',
    hullColor: [70, 110, 70],
  },
};
// Old saved games and rooms may still name the Stone Fleet by its old id.
const FACTION_ALIASES = { sun_fleet: 'stone_fleet' };
const factionId = f => FACTION_ALIASES[f] || f;
const FACTION_ORDER = ['queens_fleet', 'corsairs', 'treasure_fleet', 'stone_fleet', 'shadow_fleet', 'industry', 'islanders'];

// Coins (rulebook v0.6). Each player adds 20 to the bag.
const COIN_DEFS = {
  brace:    { name: 'Brace for Impact',  short: 'Brace',    icon: '\uD83D\uDEE1\uFE0F', text: 'Put it on one of your ships. The next hit that ship takes is ignored.' },
  signal:   { name: 'Signal Flags',      short: 'Signal',   icon: '\uD83D\uDEA9', text: 'One of your ships gives up its action and only sails forward. Another of your ships takes two full turns.' },
  fullsail: { name: 'Full Sail',         short: 'Full Sail', icon: '\u26F5', text: 'One of your ships steers and sails twice this turn. It does not fire or take an island action.' },
  evasive:  { name: 'Evasive Maneuvers', short: 'Evasive',  icon: '\u2194\uFE0F', text: 'One of your ships slides one ship-width to port or starboard, on top of its turn.' },
  gunner:   { name: 'Skilled Gunner',    short: 'Gunner',   icon: '\uD83C\uDFAF', text: 'One of your ships fires twice this turn, both before it sails on.' },
  repair:   { name: 'Repair Crew',       short: 'Repair',   icon: '\uD83D\uDD27', text: 'Restore 1 fitting. A dead ship needs another of your ships touching it.' },
  boarding: { name: 'Boarding Party',    short: 'Boarding', icon: '\u2694\uFE0F', text: 'Remove 1 fitting from an enemy ship touching yours. With Repair, capture a dead one.' },
};
const COIN_ORDER = ['brace', 'signal', 'fullsail', 'evasive', 'gunner', 'repair', 'boarding'];
// Coin renders shared with the site (same origin).
const COIN_IMG = {
  brace: 'coin-brace-for-impact', signal: 'coin-signal-flag', fullsail: 'coin-full-sail', evasive: 'coin-evasive-maneuver',
  gunner: 'coin-skilled-gunner', repair: 'coin-repair-crew', boarding: 'coin-boarding-party',
};
for (const id of COIN_ORDER) COIN_DEFS[id].img = `../assets/images/coins/${COIN_IMG[id]}.webp`;
const COIN_SET = { brace: 4, signal: 2, fullsail: 2, evasive: 2, gunner: 4, repair: 4, boarding: 2 };
const RULES_VERSION = 'v0.6';

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

// Ship names are built from each fleet's word lists (FACTION_DEFS[f].names),
// so every game gets a new crew. They use rand(), so an online game's names
// come from the server's seed and match on every screen. `used` keeps them
// unique across the table.
function shipName(fid, used) {
  const spec = FACTION_DEFS[fid].names;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  for (let tries = 0; tries < 40; tries++) {
    const name = pick(spec.forms).replace(/\{(\w)\}/g, (_, k) => pick(spec[k]));
    if (!used.has(name)) { used.add(name); return name; }
  }
  const name = `${FACTION_DEFS[fid].name} ${used.size + 1}`;
  used.add(name);
  return name;
}
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
