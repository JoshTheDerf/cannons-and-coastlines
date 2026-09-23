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

// ── Unit checks: Industry turret and fittings, auto end of turn ──
{
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  engine.setRand(engine.seededRandom(99));
  engine.newGame({ seats: [{ faction: 'industry', color: 0 }, { faction: 'queens_fleet', color: 1 }], setup: 'quick', table: 'rect' });
  const G = engine.G;
  G.terrain = [];
  const [ind] = G.players[1].ships;
  const e = G.players[2].ships[0];
  ok(ind.maxFit === 3 && ind.fit === 3 && engine.shipSlots(ind).length === 2, 'Industry: 3 fittings (2 hull + turret), bow and turret slots');
  // Turret steering is part of the Fire action; the hull does not turn.
  Object.assign(ind, { x: 40, y: 60, h: 0 }); Object.assign(e, { x: 80, y: 60, h: 0 });
  const h0 = ind.h;
  const r = engine.act(1, { t: 'fire', ship: ind.id, source: 'ship', slot: 1, h: Math.PI / 2, D: 30 });
  ok(r.ok && ind.h === h0 && Math.abs(ind.turretRel - Math.PI / 2) < 1e-9 && ind.stage === 'click', 'turret aims any way, keeps its facing, the hull stays put and the ship still owes its click');
  ok(!engine.act(1, { t: 'move', ship: ind.id, h: 1, clicks: 1 }).ok || Math.abs(ind.h - h0) < 1e-9, 'no steering after firing the turret');
  // Fittings come off turret, cargo, then smokestack; repairs go the other way.
  engine.G.players[1].ships.forEach(s => { s.acted = true; });
  const kinds = engine.fittingLayout(ind).map(f => f.kind).join(',');
  ok(kinds === 'stack,cargo,turret', `Industry fittings are ${kinds}`);
  const order = [engine.applyHit(ind), ind.lastLost, engine.applyHit(ind), ind.lastLost, engine.applyHit(ind), ind.lastLost];
  ok(order.join() === 'fitting,2,fitting,1,dead,0', `lost turret, then cargo, then smokestack (${order.join()})`);
  ok(engine.shipSlots(ind).length === 1, 'turret gone: only the bow gun');
  const back = []; for (let k = 0; k < 3; k++) { const i = engine.nextToRestore(ind); back.push(i); ind.fitMask[i] = true; ind.fit++; }
  ok(back.join() === '0,1,2', `repairs put back smokestack, cargo, then turret (${back.join()})`);
  engine.oneFitting(ind);
  ok(ind.fit === 1 && ind.fitMask.join() === 'true,false,false' && !engine.hasTurret(ind), 'captured or raised Industry ship has 1 fitting (smokestack) and only its bow gun');
  const qf = engine.G.players[2].ships[0];
  ok(engine.fittingLayout(qf).map(f => f.kind).join() === 'mast,cargo,mast,cargo', "Queen's Fleet: mast, cargo, mast, cargo");
  const qorder = []; for (let k = 0; k < 4; k++) { qf.stoneUsed = true; qf.braced = false; engine.applyHit(qf); qorder.push(engine.fittingLayout(qf)[qf.lastLost].kind); }
  ok(qorder.join() === 'cargo,cargo,mast,mast', `sail ships lose cargo before masts (${qorder.join()})`);
  ind.fit = 0; ind.fitMask = [false, false, false];
  ok(engine.applyHit(ind, { x: 0, y: 0 }) === 'sunk', 'fittings + 1 hits to sink');
  // Auto end of turn.
  engine.newGame({ seats: [{ faction: 'corsairs', color: 0 }, { faction: 'queens_fleet', color: 1 }], setup: 'quick', table: 'rect' });
  ok(!engine.turnIsOver(1), 'turn is not over while ships have yet to go');
  for (const s of engine.G.players[1].ships.slice(0, 2)) engine.act(1, { t: 'move', ship: s.id, h: s.h, clicks: 1 });
  ok(!engine.turnIsOver(1), 'not over with one ship left');
  const last = engine.G.players[1].ships[2];
  const ev = engine.act(1, { t: 'move', ship: last.id, h: last.h, clicks: 2 });
  ok(engine.turnIsOver(1) && engine.eventsDuration(ev.events) > 400, 'over once every ship has gone');
  if (fails) process.exitCode = 1;
}

// ── Unit checks: 15 degree splay on broadside and Islander stern slots ──
{
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  const D15 = 15 * Math.PI / 180, near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9;
  engine.setRand(engine.seededRandom(5));
  engine.newGame({ seats: [{ faction: 'queens_fleet', color: 0 }, { faction: 'islanders', color: 1 }], setup: 'quick', table: 'rect' });
  const q = engine.G.players[1].ships[0], isl = engine.G.players[2].ships[0];
  const qs = engine.shipSlots(q), is = engine.shipSlots(isl);
  const by = (sl, label) => sl.find(s => s.label === label);
  ok(near(by(qs, 'Starboard fore').dir, Math.PI / 2 - D15) && near(by(qs, 'Port fore').dir, -Math.PI / 2 + D15), 'forward broadside slots splay 15 deg toward the bow');
  ok(near(by(qs, 'Starboard aft').dir, Math.PI / 2 + D15) && near(by(qs, 'Port aft').dir, -Math.PI / 2 - D15), 'aft broadside slots splay 15 deg toward the stern');
  ok(near(by(qs, 'Starboard').dir, Math.PI / 2) && near(by(qs, 'Port').dir, -Math.PI / 2), 'middle broadside slots fire square to the hull');
  ok(near(by(is, 'Stern port').dir, Math.PI + D15) && near(by(is, 'Stern starboard').dir, Math.PI - D15) && near(by(is, 'Stern').dir, Math.PI), 'Islander stern slots: outer two splay 15 deg to their side, centre straight astern');
  // A shot goes straight out along the angled slot.
  engine.G.terrain = [];
  Object.assign(q, { x: 50, y: 60, h: 0 });
  const w = engine.slotWorld(q, by(qs, 'Starboard fore'));
  const tr = engine.traceShot({ ship: q }, w.x, w.y, w.h, 30, 0);
  const ang = Math.atan2(tr.x - w.x, -(tr.y - w.y));
  ok(Math.abs(ang - (Math.PI / 2 - D15)) < 0.02, `shot from the forward starboard slot flies 15 deg ahead of abeam (${(ang * 180 / Math.PI).toFixed(1)} deg)`);
  if (fails) process.exitCode = 1;
}

// ── Small self-play tournament (full one: npm run tournament) ──
{
  const { headToHead, stoneTables, reportStone } = await import('./tournament.mjs');
  headToHead(1);
  reportStone(3, stoneTables({ n: 3, seeds: 1, style: 'plain' }), stoneTables({ n: 3, seeds: 1, style: 'tactical' }));
}
