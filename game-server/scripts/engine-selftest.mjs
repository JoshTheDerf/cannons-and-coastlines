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
  // Hits take the fitting nearest the impact.
  const tw = engine.fittingWorld(ind, 2);
  engine.G.players[1].ships.forEach(s => { s.acted = true; });
  let res = engine.applyHit(ind, { x: tw.x + 1.9, y: tw.y });
  ok(res === 'fitting' && ind.lastLost === 2 && !engine.hasTurret(ind) && engine.shipSlots(ind).length === 1, 'a hit on the turret knocks it off: only the bow gun is left');
  const bw = engine.fittingWorld(ind, 0);
  res = engine.applyHit(ind, { x: bw.x, y: bw.y - 1 });
  ok(res === 'fitting' && ind.lastLost === 0 && ind.fit === 1, 'a hit near the bow takes the bow fitting');
  ind.fit = 3; ind.fitMask = [true, true, true];
  engine.applyHit(ind, null, 1);
  ok(ind.lastLost === 1 && ind.fitMask.join() === 'true,false,true', 'boarding takes the fitting the attacker picks');
  ind.fitMask = [true, false, false]; ind.fit = 1;
  ok(engine.defaultRestore(ind) === 2, 'Repair puts the turret back by default');
  engine.oneFitting(ind);
  ok(ind.fit === 1 && engine.hasTurret(ind), 'captured or raised at 1 fitting: the turret');
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
