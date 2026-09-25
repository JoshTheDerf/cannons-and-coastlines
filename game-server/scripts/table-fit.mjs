// Does each table fit the rulebook's islands and every fleet? For each
// table and player count: how many islands the setup placed (the rulebook
// count in brackets) and whether any ship had to line up touching something.
// Half the layouts put the five-ship Islanders in every seat, the widest case.
//
//   node scripts/table-fit.mjs
//   node scripts/table-fit.mjs --tables round6,fold6,fold8,dining
import { engine as E } from '../src/engine.gen.js';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const tables = opt('--tables', 'round6,fold6,fold8').split(','), seeds = +opt('--seeds', 20);
const F = E.FACTION_ORDER, want = { 2: 4, 3: 6, 4: 6, 5: 8, 6: 8, 7: 10 };
console.log('Islands placed (rulebook count in brackets); "!" = a fleet could not line up without touching something');
console.log('players'.padEnd(9) + tables.map(t => t.padStart(9)).join(''));
for (const n of [2, 3, 4, 5, 6, 7]) {
  let row = String(n).padEnd(9);
  for (const t of tables) {
    let min = 99, max = 0, bad = 0;
    for (let k = 0; k < seeds; k++) {
      E.setRand(E.seededRandom(900 + k));
      E.newGame({ seats: Array.from({ length: n }, (_, i) => ({ faction: k % 2 ? 'islanders' : F[i % 7], color: i })), setup: 'quick', table: t });
      const c = E.islands().length; min = Math.min(min, c); max = Math.max(max, c);
      for (const p of E.G.order) for (const s of E.G.players[p].ships) if (E.poseGapOf(s) < -0.05) bad++;
    }
    row += `${min === max ? min : min + '-' + max}${bad ? '!' : ''}`.padStart(9);
  }
  console.log(row + `   (${want[n]})`);
}
