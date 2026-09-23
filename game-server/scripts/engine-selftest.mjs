// Plays a few all-computer games through the bundled engine, the same way
// the GameRoom does (one action per step, seeded dice), and checks that
// every game finishes without a refused action.
import { engine } from '../src/engine.gen.js';

let seed = 12345;
for (const n of [2, 3, 5, 7]) {
  const rng = engine.seededRandom(seed++);
  engine.setRand(rng);
  engine.setAiEffort('lite');
  const seats = Array.from({ length: n }, (_, i) => ({ faction: engine.FACTION_ORDER[i % 7], color: i, name: 'AI ' + (i + 1), ai: true }));
  engine.newGame({ seats, setup: 'quick', stalemate: false, table: 'round' });
  let steps = 0, refused = 0, slow = 0;
  while (engine.G.phase === 'play' && steps < 60000) {
    const G = JSON.parse(JSON.stringify(engine.G)); // what the Durable Object does between steps
    engine.G = G;
    const p = G.active;
    const t0 = performance.now();
    const a = engine.aiNextAction(p);
    const r = engine.act(p, a);
    if (performance.now() - t0 > 10) slow++;
    if (!r.ok) { refused++; engine.act(p, { t: 'endTurn' }); }
    steps++;
  }
  const s = engine.scoreBreakdown();
  console.log(`${n} seats: ${engine.G.phase} after ${engine.G.turn} turns, ${steps} steps, refused ${refused}, >10ms ${slow}, winner ${engine.G.winner}: ${engine.G.endReason}`,
    JSON.stringify(Object.fromEntries(engine.G.order.map(p => [p, s[p].total]))));
  if (engine.G.phase !== 'over' || refused) process.exitCode = 1;
}
