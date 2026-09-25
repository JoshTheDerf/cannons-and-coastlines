// How often computer ships sail into things: every move in seeded
// computer games, sorted by what stopped it short (a rock, a reef, an
// island that was not where it was going, its own fleet, an enemy, the
// table edge), and how many ships could not move at all.
//
//   node scripts/bump-stats.mjs
//   node scripts/bump-stats.mjs --games 60 --engine /tmp/variant.js
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const enginePath = args.includes('--engine') ? pathToFileURL(resolve(opt('--engine'))).href : new URL('../src/engine.gen.js', import.meta.url).href;
const { engine: E } = await import(enginePath);
const games = +opt('--games', 40), F = E.FACTION_ORDER;
const setups = [['round6', 2], ['round6', 4], ['round6', 6], ['fold6', 2], ['fold8', 4]];
console.log('table     players  moves  rock%  reef%  isle%  own%  enemy%  edge%  stuck%');
for (const [table, n] of setups) {
  const c = { moves: 0, rock: 0, reef: 0, island: 0, own: 0, enemy: 0, edge: 0, stuck: 0 };
  for (let g = 0; g < games; g++) {
    E.setRand(E.seededRandom(5000 + g * 7 + n));
    E.setAiEffort('lite');
    E.newGame({ seats: Array.from({ length: n }, (_, i) => ({ faction: F[(g + i * 3) % 7], color: i, ai: true })), setup: 'quick', table, stalemate: false });
    const G = E.G;
    let steps = 0;
    while (G.phase === 'play' && steps++ < 30000 && G.turn <= 40 * n) {
      const p = G.active, a = E.aiNextAction(p);
      const r = E.act(p, a);
      if (!r.ok) { E.act(p, { t: 'endTurn' }); continue; }
      for (const e of r.events) {
        if (e.e !== 'move') continue;
        c.moves++;
        const pl = e.plan;
        if (pl.moved < 0.05) c.stuck++;
        if (!pl.stoppedBy || pl.moved >= pl.planned - 0.05) continue;
        const s = G.players[p].ships.find(x => x.id === e.ship) || { x: pl.end.x, y: pl.end.y };
        if (pl.stoppedBy === 'edge') c.edge++;
        else if (pl.stoppedBy === 'island') {
          // Stopping at an island is how a ship gets there; count only
          // islands with nothing to do (ours, with another ship nearer).
          const t = E.islands().find(t => E.shipTouchesTerrain(s, t));
          if (t && t.owner === p && E.collectProblem(s, t)) c.island++;
        } else if (pl.stoppedBy === 'terrain') {
          const t = G.terrain.find(t => t.type !== 'island' && E.shipTouchesTerrain(s, t));
          if (t) c[t.type === 'rock' ? 'rock' : 'reef']++;
        } else if (pl.stoppedBy === 'ship') {
          const o = E.allShips().find(o => o !== s && E.shipsTouching(s, o));
          if (o) c[o.owner === p ? 'own' : 'enemy']++;
        }
      }
    }
  }
  const pc = k => (100 * c[k] / c.moves).toFixed(1).padStart(6);
  console.log(`${table.padEnd(9)} ${String(n).padStart(7)} ${String(c.moves).padStart(6)} ${pc('rock')} ${pc('reef')} ${pc('island')} ${pc('own')} ${pc('enemy')}  ${pc('edge')} ${pc('stuck')}`);
}
