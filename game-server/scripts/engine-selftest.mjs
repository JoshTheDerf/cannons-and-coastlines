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
  const r = engine.act(1, { t: 'fire', ship: ind.id, source: 'ship', slot: 1, h: Math.PI / 2, elev: 'flat' });
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
  qf.fit = qf.maxFit; qf.fitMask = null; // the turret test above may have hit it
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
  const tr = engine.traceShot({ ship: q }, w.x, w.y, engine.aimedShot(w.h, 'flat'));
  const ang = Math.atan2(tr.x - w.x, -(tr.y - w.y));
  ok(Math.abs(ang - (Math.PI / 2 - D15)) < 0.02, `shot from the forward starboard slot flies 15 deg ahead of abeam (${(ang * 180 / Math.PI).toFixed(1)} deg)`);
  if (fails) process.exitCode = 1;
}

// ── Unit checks: island guns fire only from the island's six slots ──
{
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;
  engine.setRand(engine.seededRandom(7));
  engine.newGame({ seats: [{ faction: 'queens_fleet', color: 0 }, { faction: 'corsairs', color: 1 }], setup: 'quick', table: 'rect' });
  const G = engine.G;
  // Islands are looked up by index; id 3 turns it, so the slots are not at their unturned angles.
  G.terrain = [0, 1, 2].map(i => ({ type: 'rock', x: 5 + i * 3, y: 5, r: 1, owner: null, id: i })).concat([{ type: 'island', x: 60, y: 60, r: 6.5, owner: 1, id: 3 }]);
  const q = G.players[1].ships[0];
  Object.assign(q, { x: 60 + 6.5 + q.wid / 2 + 0.1, y: 60, h: 0 });
  const slots = engine.islandSlots(G.terrain[3]);
  const gaps = slots.map((s, i) => Math.atan2(Math.sin(slots[(i + 1) % 6].h - s.h), Math.cos(slots[(i + 1) % 6].h - s.h)));
  ok(slots.length === 6 && gaps.every(g => Math.abs(Math.abs(g) - Math.PI / 3) < 1e-6), 'six island slots, 60 deg apart');
  const fire = a => { G.players[1].ships.forEach(s => { s.acted = false; s.stage = 'action'; s.turnsLeft = 1; }); G.active = 1; return engine.act(1, Object.assign({ t: 'fire', ship: q.id, source: 'island', island: 3, elev: 'flat' }, a)); };
  let r = fire({ slot: 4, h: 0 });
  const shot = r.ok && r.events.find(e => e.e === 'shot');
  ok(shot && Math.abs(Math.atan2(Math.sin(shot.h - slots[4].h), Math.cos(shot.h - slots[4].h))) <= 5 * Math.PI / 180 + 1e-9, 'slot 4 fires along slot 4 (within the cannon\'s 5 degree spread), whatever heading is asked');
  const between = slots[1].h + 0.2;
  r = fire({ h: between });
  const shot2 = r.ok && r.events.find(e => e.e === 'shot');
  const o = engine.islandGunOrigin(G.terrain[3], slots[1].h);
  ok(shot2 && Math.hypot(shot2.origin.x - o.x, shot2.origin.y - o.y) < 1e-6, 'no slot given: the nearest slot to the heading fires');
  if (fails) process.exitCode = 1;
}

// ── Small self-play tournament (full one: npm run tournament) ──
{
  const { headToHead, stoneTables, reportStone } = await import('./tournament.mjs');
  headToHead(1);
  reportStone(3, stoneTables({ n: 3, seeds: 1, style: 'plain' }), stoneTables({ n: 3, seeds: 1, style: 'tactical' }));
}

// ── Unit checks: v0.6 cannons, prizes and collecting ──
{
  let fails = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
  engine.setRand(engine.seededRandom(42));
  engine.newGame({ seats: [{ faction: 'queens_fleet', color: 0 }, { faction: 'corsairs', color: 1 }], setup: 'quick', table: 'round' });
  const G = engine.G;
  G.terrain = [];
  // Cannons: straight out comes down about 14 cm out, tipped up about 38 cm
  // and clears a hull on the way; the spread stays inside 5 degrees.
  const flat = engine.shotPath(66, 66, engine.aimedShot(0, 'flat')), lob = engine.shotPath(66, 66, engine.aimedShot(0, 'lob'));
  ok(Math.abs(flat.legs[0].s1 - 14) < 3 && Math.abs(lob.legs[0].s1 - 38) < 4 && flat.total > 28 && flat.total < 46 && lob.total > flat.total, `first landing flat ${flat.legs[0].s1.toFixed(1)} / lob ${lob.legs[0].s1.toFixed(1)} cm; travel flat ${flat.total.toFixed(0)} / lob ${lob.total.toFixed(0)} cm`);
  ok(engine.pathAt(lob, 20).z > 3 && engine.pathAt(flat, 5).z < 3, 'a lob clears a hull 20 cm out; a flat shot does not');
  let wide = 0;
  for (let i = 0; i < 500; i++) { const s = engine.wobbleShot(0, 'flat'); if (Math.abs(Math.atan2(Math.sin(s.h), Math.cos(s.h))) > 5 * Math.PI / 180 + 1e-9) wide++; }
  ok(wide === 0, 'launch spread never passes 5 degrees');
  // Prizes: a hit gives the shooter the fitting; a repair takes it back.
  const [a] = G.players[1].ships, [b] = G.players[2].ships;
  Object.assign(a, { x: 60, y: 66, h: 0 }); Object.assign(b, { x: 90, y: 66, h: 0 });
  G.players[2].ships.slice(1).forEach(s => Object.assign(s, { x: 20, y: 20 + G.players[2].ships.indexOf(s) * 8 }));
  G.players[1].ships.slice(1).forEach(s => Object.assign(s, { x: 110, y: 100 + G.players[1].ships.indexOf(s) * 8 }));
  engine.applyHit(b, 1);
  let sc = engine.scoreBreakdown();
  ok(sc[1].fittings === 1 && sc[1].total === 4 + 8 + 8 + sc[1].coins, `a hit is a prize fitting worth 4 (${sc[1].fittings}, total ${sc[1].total}: +8 most ships and +8 most islands, tied)`);
  G.active = 2; G.coinPhase = true; G.players[2].coins.repair = 1;
  G.players[2].ships.forEach(s => { s.acted = false; s.stage = 'action'; s.turnsLeft = 1; s.pending = null; });
  const rep = engine.act(2, { t: 'coin', coin: 'repair', target: b.id });
  ok(rep.ok && engine.scoreBreakdown()[1].fittings === 0, 'Repair Crew takes the fitting back from the prize pile');
  // Sinking gives the hull, worth 2.
  b.fit = 0; b.fitMask = null; engine.applyHit(b, 1);
  ok(engine.scoreBreakdown()[1].hulls === 1, 'sinking a ship gives its hull as a prize');
  // Collect: only the nearest of your ships, touching or not, once a turn.
  G.terrain = [{ type: 'island', x: 66, y: 30, r: 6, owner: 1, id: 0 }];
  G.active = 1; G.coinPhase = true;
  G.players[1].ships.forEach(s => { s.acted = false; s.stage = 'action'; s.turnsLeft = 1; s.noAction = false; });
  const [s1, s2] = G.players[1].ships;
  Object.assign(s1, { x: 66, y: 50, h: Math.PI / 2 }); Object.assign(s2, { x: 66, y: 60, h: Math.PI / 2 });
  ok(!engine.act(1, { t: 'collect', ship: s2.id, island: 0 }).ok, 'a farther ship cannot collect');
  const c = engine.act(1, { t: 'collect', ship: s1.id, island: 0 });
  ok(c.ok && s1.stage === 'click', 'the nearest ship collects out at sea, then still owes its click');
  ok(!engine.act(1, { t: 'collect', ship: s2.id, island: 0 }).ok, 'an island pays out once a turn');
  // Dead ships: no Collect, no island gun, and they do not block a live ship from collecting.
  G.collected = [];
  s1.fit = 0; s1.fitMask = null; s1.acted = false; s1.stage = 'action'; s1.turnsLeft = 1;
  Object.assign(s1, { x: 66, y: 30 + 6 + s1.wid / 2 + 0.1, h: Math.PI / 2 });
  s2.acted = false; s2.stage = 'action'; s2.turnsLeft = 1;
  ok(!engine.act(1, { t: 'collect', ship: s1.id, island: 0 }).ok, 'a dead ship cannot collect, even touching the island');
  ok(!engine.act(1, { t: 'fire', ship: s1.id, source: 'island', island: 0, slot: 0, elev: 'flat' }).ok, 'a dead ship cannot fire an island gun');
  ok(engine.act(1, { t: 'collect', ship: s2.id, island: 0 }).ok, 'a dead ship nearer the island does not stop a live one collecting');
  // Industry turret: blind straight ahead and astern (10 degrees either side).
  engine.newGame({ seats: [{ faction: 'industry', color: 0 }, { faction: 'corsairs', color: 1 }], setup: 'quick', table: 'round' });
  const I = engine.G, ind = I.players[1].ships[0];
  I.terrain = []; Object.assign(ind, { x: 40, y: 60, h: 0, acted: false, stage: 'action', turnsLeft: 1 });
  const tSlot = engine.shipSlots(ind).findIndex(sl => sl.free);
  I.active = 1; I.coinPhase = true;
  const rt = engine.act(1, { t: 'fire', ship: ind.id, source: 'ship', slot: tSlot, h: 0.02, elev: 'flat' });
  const rel = Math.abs(Math.atan2(Math.sin(ind.turretRel), Math.cos(ind.turretRel))) * 180 / Math.PI;
  ok(rt.ok && Math.abs(rel - 10) < 0.01, `turret asked to fire dead ahead swings to the edge of its blind cone (${rel.toFixed(1)} deg)`);
  // Full Sail: steer and sail twice, no firing; coins go between ship actions.
  engine.newGame({ seats: [{ faction: 'queens_fleet', color: 0 }, { faction: 'corsairs', color: 1 }], setup: 'quick', table: 'round' });
  const J = engine.G, [f1, f2] = J.players[1].ships;
  J.terrain = []; J.players[1].coins.fullsail = 1; J.players[1].coins.brace = 1;
  Object.assign(f1, { x: 60, y: 60, h: 0 }); Object.assign(f2, { x: 90, y: 90, h: 0 });
  ok(engine.act(1, { t: 'coin', coin: 'fullsail', target: f1.id }).ok && f1.fullSail === 2, 'Full Sail goes on a ship yet to act');
  ok(!engine.act(1, { t: 'fire', ship: f1.id, source: 'ship', slot: 0, elev: 'flat' }).ok, 'a ship under Full Sail cannot fire');
  const y0 = f1.y;
  ok(engine.act(1, { t: 'move', ship: f1.id, h: Math.PI / 2, clicks: 3 }).ok && !f1.acted, 'first steer-and-sail leaves the turn open');
  ok(!engine.act(1, { t: 'coin', coin: 'brace', target: f2.id }).ok, 'no coins between the two Full Sail moves');
  ok(engine.act(1, { t: 'move', ship: f1.id, h: 0, clicks: 3 }).ok && f1.acted && f1.y < y0 - 1, 'second steer-and-sail (it turned back north) ends its turn');
  ok(engine.act(1, { t: 'coin', coin: 'brace', target: f2.id }).ok, 'a coin can be spent before the next ship acts');
  // Treasure Fleet: three junks.
  engine.newGame({ seats: [{ faction: 'treasure_fleet', color: 0 }, { faction: 'corsairs', color: 1 }], setup: 'quick', table: 'round' });
  ok(engine.G.players[1].ships.length === 3, 'the Treasure Fleet fields three junks');
  // Stone Hulls: first hit ignored at sea, not while touching an island.
  engine.newGame({ seats: [{ faction: 'stone_fleet', color: 0 }, { faction: 'corsairs', color: 1 }], setup: 'quick', table: 'round' });
  const H = engine.G;
  H.terrain = [{ type: 'island', x: 66, y: 66, r: 6, owner: null, id: 0 }];
  const st = H.players[1].ships[0];
  Object.assign(st, { x: 30, y: 30, h: 0 });
  ok(engine.applyHit(st, 2) === 'stone', 'Stone Hulls shrug off the first hit at sea');
  Object.assign(st, { x: 66 + 6 + st.wid / 2 + 0.1, y: 66, h: 0 }); st.stoneUsed = false;
  ok(engine.applyHit(st, 2) === 'fitting', 'a Stone ship touching an island takes the hit');
  if (fails) process.exitCode = 1;
}
