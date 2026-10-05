// Tables and seatings for the simulator. A scenario is how many fleets,
// on which table, sitting where. Variants run on each one.
//
// seating, two players: on a round table 'opposite' or 'quarter' (the
// rulebook's); on a folding table 'sides', 'diagonal' (the rulebook's) or
// 'ends'. Three or more spread evenly round the table.
export const SCENARIOS = {
  'duel-opposite': { label: '2p 6ft round, opposite', n: 2, table: 'round6', seating: 'opposite' },
  'duel-quarter': { label: '2p 6ft round, quarter', n: 2, table: 'round6', seating: 'quarter' },
  'duel-fold6': { label: '2p 6ft folding, diagonal', n: 2, table: 'fold6', seating: 'diagonal' },
  'duel-fold6-ends': { label: '2p 6ft folding, ends', n: 2, table: 'fold6', seating: 'ends' },
  'duel-fold8': { label: '2p 8ft folding, diagonal', n: 2, table: 'fold8', seating: 'diagonal' },
  ffa3: { label: '3p 6ft round', n: 3, table: 'round6' },
  ffa4: { label: '4p 6ft round', n: 4, table: 'round6' },
  ffa6: { label: '6p 6ft round', n: 6, table: 'round6' },
};

export const DEFAULT_SCENARIOS = ['duel-opposite', 'duel-quarter', 'ffa4'];

export const FLEETS = ['queens_fleet', 'corsairs', 'treasure_fleet', 'stone_fleet', 'shadow_fleet', 'industry', 'islanders'];
export const FLEET_SETS = { all: FLEETS, base: ['queens_fleet', 'corsairs'] };
export const SHORT = { queens_fleet: 'Queen', corsairs: 'Cors', treasure_fleet: 'Treas', stone_fleet: 'Stone', shadow_fleet: 'Shadow', industry: 'Indus', islanders: 'Isl' };

/**
 * The fleets and styles for game g of a scenario. The same g always gives
 * the same table, so every variant plays the same set of games (a paired
 * comparison: differences come from the rules, not the draw).
 * Two players cycle through every ordered pairing; more players get a
 * seeded draw of distinct fleets, rotated so each sits in every seat.
 * With a challenger style, one seat per game (rotating) plays it and the
 * rest play the computer.
 */
export function lineup(sc, g, pool, vs) {
  let factions;
  if (sc.n === 2) {
    const pairs = [];
    for (const a of pool) for (const b of pool) if (a !== b || pool.length === 1) pairs.push([a, b]);
    factions = pairs[g % pairs.length];
  } else {
    let r = (g * 2654435761 + 977) >>> 0;
    const next = () => { r = (r + 0x6D2B79F5) >>> 0; let t = Math.imul(r ^ (r >>> 15), r | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const deck = [];
    while (deck.length < sc.n) deck.push(...pool);
    for (let i = deck.length - 1; i > 0; i--) { const k = Math.floor(next() * (i + 1)); [deck[i], deck[k]] = [deck[k], deck[i]]; }
    const pick = pool.length >= sc.n ? [...new Set(deck)].slice(0, sc.n) : deck.slice(0, sc.n), turn = g % sc.n;
    factions = pick.slice(turn).concat(pick.slice(0, turn));
  }
  // The challenger's seat rotates every pairing-cycle, so it meets each pairing from both seats.
  const cycle = sc.n === 2 ? Math.max(1, pool.length * (pool.length - 1) || 1) : 1;
  const seat = Math.floor(g / cycle) % sc.n;
  const styles = factions.map((_, i) => (vs && i === seat ? vs : 'tactical'));
  return { factions, styles };
}
