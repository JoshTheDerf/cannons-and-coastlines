// Cannons & Coastlines, digital edition: brain.js
// Computer captain. aiNextAction(p) looks at G and returns the next action
// for seat p, in the same format a player sends (see rules.js). It never
// changes the state itself, so it can run in the browser or on the server
// and always plays by the same rules as everyone else.

// Search effort. The server runs on a tight CPU budget, so it looks at
// fewer landing distances, samples and headings.
let AI_EFFORT = { samples: 16, headings: 6 };
function setAiEffort(level) {
  AI_EFFORT = level === 'lite' ? { samples: 8, headings: 3 } : { samples: 16, headings: 6 };
}

function aiMemo(p) {
  if (!G.ai || G.ai.turn !== G.turn || G.ai.p !== p) G.ai = { turn: G.turn, p, used: {}, roles: null, order: null, hit: {}, intel: null, sig: null };
  return G.ai;
}

// Styles: 'plain' is the original captain; 'tactical' (the default) plans
// islands for the whole fleet and reads the opposing fleets. Two more are
// only for balance tests (game-server/scripts/balance.mjs), pulling to the
// ends of the parking-versus-fighting question: 'turtle' parks a ship on
// every island it can and collects, 'raider' hunts ships and only takes
// islands on the way.
const styleOf = p => (G.aiStyle && G.aiStyle[p]) || 'tactical';
const tactical = p => { const st = styleOf(p); return st === 'tactical' || st === 'tactics' || st === 'turtle' || st === 'raider'; };
const off = k => G.aiOff && G.aiOff.includes(k); // for tuning runs only
const planner = p => { const st = styleOf(p); return st === 'tactical' || st === 'islands' || st === 'turtle'; };

/**
 * A per-turn read of the table: how much each enemy faction matters (by
 * ship count and how close it is), and how hard to go after each seat.
 * With three or more fleets a runaway leader draws fire, and a Stone Fleet
 * draws a lot of it: the others hold off each other while it is healthy.
 */
function aiIntel(p) {
  const memo = aiMemo(p);
  if (memo.intel) return memo.intel;
  const mine = G.players[p].ships, sc = scoreBreakdown();
  const live = G.order.filter(inGame), multi = live.length >= 3;
  const totals = live.map(q => sc[q].total).sort((a, b) => b - a);
  const tw = {}, focus = {};
  let sum = 0;
  const stoneSeat = live.find(q => q !== p && G.factions[q] === 'stone_fleet');
  const stoneHealthy = stoneSeat && G.players[stoneSeat].ships.filter(s => !isDead(s)).length >= 2;
  for (const q of live) {
    if (q === p) continue;
    const ships = G.players[q].ships;
    let prox = 0;
    for (const e of ships) prox += 1 / (1 + mine.reduce((m, s) => Math.min(m, dist(s.x, s.y, e.x, e.y)), 999) / 50);
    const f = G.factions[q];
    tw[f] = (tw[f] || 0) + prox; sum += prox;
    let m = 1;
    if (multi) {
      if (sc[q].total === totals[0] && totals[0] >= (totals[1] || 0) + 3) m *= 1.5;
      if (f === 'stone_fleet') m *= 2 + (sc[q].total === totals[0] ? 0.6 : 0) + islandsHeld(q) * 0.15;
      // The Industry's turrets reach any way; the more still aboard, the more fire it draws.
      if (f === 'industry' && !off('ind')) m *= 1 + 0.35 * G.players[q].ships.filter(hasTurret).length;
      else if (stoneHealthy && p !== stoneSeat) m *= 0.35; // informal truce while the Stone Fleet is strong
    }
    focus[q] = m;
  }
  for (const f in tw) tw[f] = sum ? tw[f] / sum : 0;
  return (memo.intel = { tw, focus, multi });
}

function aiNextAction(p) {
  const memo = aiMemo(p);
  memo.step = (memo.step || 0) + 1;
  const ships = G.players[p].ships;
  if (canDeclareVictory(p)) return { t: 'declare' };
  // Re-plan whenever an island changes hands.
  const sig = islands().map(t => t.owner || 0).join('');
  if (memo.sig !== sig) { memo.roles = null; memo.sig = sig; }
  if (!memo.roles) memo.roles = styleOf(p) === 'raider' ? aiRaiderRoles(p) : planner(p) ? aiPlanIslands(p) : aiAssignRoles(p);
  const roles = aiRoleObjects(memo.roles);

  // Finish a turn already under way: a second Gunner shot, or the click
  // forward after firing.
  for (const s of ships) {
    if (s.pending === 'shot2') {
      const again = aiBestShot(s);
      return again && again.ev > 0.5 ? aiFireAction(s, again) : { t: 'skipShot', ship: s.id };
    }
    if (s.stage === 'click' && !s.acted) return aiSailOn(s, roles);
  }

  if (G.coinPhase) {
    const c = aiCoinChoice(p, roles, memo);
    if (c) return c;
  }

  if (!memo.order) {
    memo.order = ships.slice().sort((a, b) => (isDead(b) - isDead(a)) || ((roles[b.id] === 'collect') - (roles[a.id] === 'collect'))).map(s => s.id);
  }
  for (const id of memo.order.concat(ships.map(s => s.id))) {
    const s = shipById(id);
    if (!s || s.owner !== p || s.acted) continue;
    return aiShipTurn(s, roles);
  }
  return { t: 'endTurn' };
}

/** Clicks forward on the current heading (after firing, or a ship with no action). */
function aiSailOn(s, roles) {
  const run = aiBestMove(s, roles[s.id], 1, s.moveCount, true);
  return { t: 'move', ship: s.id, h: s.h, clicks: run ? run.clicks : 1 };
}

/**
 * One ship parks on each held island to collect. The rest are sent at the
 * nearest island that is not ours, or hunt when there are none.
 * Roles are stored by id so the memo survives a JSON round trip.
 */
function aiAssignRoles(p) {
  const roles = {};
  const ships = G.players[p].ships;
  const guarded = new Set();
  for (const s of ships) {
    const own = touchingIslands(s).map(i => G.terrain[i]).find(t => t.owner === p && !guarded.has(t.id));
    if (own) { roles[s.id] = 'collect'; guarded.add(own.id); }
  }
  const targets = islands().filter(t => t.owner !== p);
  const taken = {};
  for (const s of ships) {
    if (roles[s.id]) continue;
    let best = null, bd = Infinity;
    for (const t of targets) {
      const d = dist(s.x, s.y, t.x, t.y) + (taken[t.id] || 0) * 25;
      if (d < bd) { bd = d; best = t; }
    }
    if (best) { roles[s.id] = 'isl:' + best.id; taken[best.id] = (taken[best.id] || 0) + 1; }
    else roles[s.id] = 'hunt';
  }
  return roles;
}
/**
 * Fleet plan (tactical): send ships to different islands, unclaimed first,
 * then weakly held enemy ones, scored by turns to get there under forced
 * movement, value and risk. One ship stays on each held island to collect
 * and defend. Two ships only go to the same island if it is contested.
 */
function aiPlanIslands(p) {
  const roles = {};
  const ships = G.players[p].ships;
  const enemies = enemyShips(p).filter(e => !isDead(e));
  const near = (t, r) => enemies.filter(e => dist(e.x, e.y, t.x, t.y) - t.r < r).length;
  // Keepers: a ship on a held island stays to defend it, unless an
  // unclaimed island is a short hop away and the island keeps another.
  // Rulebook v0.6: collecting no longer needs a ship there (the nearest one
  // collects from anywhere) and coins are not points, so a tactical captain
  // only keeps a ship on an island with enemies close. The turtle test
  // style and the Treasure Fleet, whose coins still score, keep every one.
  const parkAll = styleOf(p) === 'turtle' || passiveOf(p) === 'harvest' || off('park');
  const kept = new Set();
  for (const s of ships) {
    const own = touchingIslands(s).map(i => G.terrain[i]).find(t => t.owner === p);
    if (!own) continue;
    if (!parkAll && !isDead(s) && near(own, 25) === 0) continue;
    const hop = kept.has(own.id) && islands().some(t => !t.owner && dist(s.x, s.y, t.x, t.y) - t.r < s.moveCount * CLICK_LEN * 1.5);
    if (!hop) { roles[s.id] = 'collect'; kept.add(own.id); }
  }
  // Undefended held islands with enemies close: send a defender.
  const defend = islands().filter(t => t.owner === p && !kept.has(t.id) && near(t, 35) > 0);
  const targets = islands().filter(t => t.owner !== p).map(t => {
    const owner = t.owner, defenders = owner ? defendersAt(t, owner).length : 0;
    let value = owner ? 7 - 3 * defenders : 10;
    if (owner && ['shadow_fleet', 'treasure_fleet'].includes(G.factions[owner])) value += 3; // deny their engines
    return { t, value, risk: near(t, 30), slots: near(t, 30) > 0 ? 2 : 1 };
  }).concat(defend.map(t => ({ t, value: 8, risk: near(t, 30), slots: 1 })));
  const free = ships.filter(s => !roles[s.id] && !isDead(s));
  const pairs = [];
  for (const s of free) {
    for (const g of targets) {
      const t = g.t;
      const run = Math.max(0, dist(s.x, s.y, t.x, t.y) - t.r - s.len / 2);
      const turn = Math.abs(angleDiff(headingTo(t.x - s.x, t.y - s.y), s.h)) / (pivotFor(s) * Math.PI / 180);
      const turns = run / (s.moveCount * CLICK_LEN) + turn + (aiPathBlocked(s, s, t) ? 1 : 0);
      pairs.push({ s, g, score: g.value - turns * 2.2 - g.risk * 1.5 });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const used = {};
  for (const { s, g, score } of pairs) {
    if (roles[s.id] || (used[g.t.id] || 0) >= g.slots || score < -12) continue;
    roles[s.id] = 'isl:' + g.t.id; used[g.t.id] = (used[g.t.id] || 0) + 1;
  }
  // Ships left over hunt (tactical), or head for the nearest held island
  // to collect there too, or back up a target.
  const held = islands().filter(t => t.owner === p);
  for (const s of ships) {
    if (roles[s.id]) continue;
    if (isDead(s)) { roles[s.id] = touchingIslands(s).some(i => G.terrain[i].owner === p) ? 'collect' : 'hunt'; continue; }
    if (!parkAll) { roles[s.id] = 'hunt'; continue; }
    const pool = held.length ? held : targets.map(g => g.t);
    const t = pool.slice().sort((a, b) => dist(s.x, s.y, a.x, a.y) - dist(s.x, s.y, b.x, b.y))[0];
    roles[s.id] = t ? 'isl:' + t.id : 'hunt';
  }
  return roles;
}

/**
 * Raider (balance tests): every ship hunts, and only heads for an island
 * that is not ours when it is much closer than the nearest enemy.
 */
function aiRaiderRoles(p) {
  const roles = {}, enemies = enemyShips(p).filter(e => !isDead(e)), taken = {};
  for (const s of G.players[p].ships) {
    if (isDead(s)) { roles[s.id] = 'hunt'; continue; }
    const ne = enemies.reduce((m, e) => Math.min(m, dist(s.x, s.y, e.x, e.y)), 999);
    let best = null, bd = Infinity;
    for (const t of islands()) {
      if (t.owner === p || taken[t.id] || (t.owner && defendersAt(t, t.owner).length)) continue;
      const d = dist(s.x, s.y, t.x, t.y) - t.r;
      if (d < bd) { bd = d; best = t; }
    }
    if (best && bd < ne * 0.5) { roles[s.id] = 'isl:' + best.id; taken[best.id] = 1; } else roles[s.id] = 'hunt';
  }
  return roles;
}

/** Does a straight run from pose ps to island t cross other terrain? */
function aiPathBlocked(ship, ps, t) {
  for (const o of G.terrain) {
    if (o === t) continue;
    const d = ptSegDist(o.x, o.y, ps.x, ps.y, t.x, t.y);
    if (d < o.r + ship.wid / 2 + 1 && dist(ps.x, ps.y, o.x, o.y) < dist(ps.x, ps.y, t.x, t.y)) return true;
  }
  return false;
}

function aiRoleObjects(roles) {
  const out = {};
  for (const [id, r] of Object.entries(roles)) out[id] = typeof r === 'string' && r.startsWith('isl:') ? G.terrain[+r.slice(4)] : r;
  return out;
}

// ═══ Coins ═════════════════════════════════════════════

function aiCoinChoice(p, roles, memo) {
  const me = G.players[p];
  const has = id => me.coins[id] > 0;
  const coin = (id, s, extra) => Object.assign({ t: 'coin', coin: id, target: s.id }, extra || {});
  // Rulebook v0.6: coins are not points, only things to spend, so the
  // tactical captain spends them. The Treasure Fleet's coins still score,
  // so it keeps the old, careful habits.
  const spend = tactical(p) && !off('spend') && passiveOf(p) !== 'harvest';
  const reserve = spend ? 1 : 3;
  if (reviveAllowed(p) && coinTotal(p) >= 3) {
    const isl = islands().filter(t => t.owner === p && freePoseAtIsland(me.sunk[0], t));
    if (isl.length) return { t: 'revive', island: isl[0].id };
  }
  for (const t of enemyShips(p)) {
    if (isDead(t) && has('boarding') && has('repair') && coinTargets(p, 'boarding').includes(t)) return coin('boarding', t);
  }
  for (const t of enemyShips(p)) {
    if (!isDead(t) && has('boarding') && coinTargets(p, 'boarding').includes(t)) return coin('boarding', t);
  }
  if (has('repair')) {
    for (const s of me.ships.slice().sort((a, b) => a.fit - b.fit)) {
      if (memo.used['repair' + s.id]) continue;
      // A repair also takes a prize back from whoever holds it: a point off them.
      const hurt = spend ? s.fit < s.maxFit : s.fit === 0 || s.fit <= s.maxFit - 2 || (s.fit < s.maxFit && s.fit <= 1);
      if (hurt && coinTargets(p, 'repair').includes(s)) { memo.used['repair' + s.id] = 1; return coin('repair', s); }
    }
  }
  if (has('brace')) {
    for (const s of me.ships) if (s.fit <= (spend ? 2 : 1) && !s.braced && aiThreat(s, s) > 0) return coin('brace', s);
    // Tactical: brace ships a Corsair could board next turn.
    if (tactical(p) && !off('brace') && coinTotal(p) >= 2) {
      for (const s of me.ships) {
        if (s.braced || s.fit > 2) continue;
        if (enemyShips(p).some(e => G.factions[e.owner] === 'corsairs' && !isDead(e) && dist(e.x, e.y, s.x, s.y) < 16)) return coin('brace', s);
      }
    }
  }
  if (has('evasive')) {
    for (const s of me.ships) {
      if (isDead(s) || memo.used['ev' + s.id]) continue;
      memo.used['ev' + s.id] = 1;
      const plans = evasivePlans(s);
      // Slide a fragile ship out of a lane, or away from an edge it faces.
      const fragile = s.fit <= 1 && aiThreat(s, s) > 0;
      const cornered = aiEdgeRisk(s, s) >= 14;
      if (!fragile && !cornered) continue;
      const side = ['port', 'stbd'].find(k => plans[k].moved > s.wid * 0.8 &&
        (fragile ? aiThreat(s, plans[k].end) === 0 : aiEdgeRisk(s, Object.assign({}, plans[k].end, { h: s.h })) < 14));
      if (side) return coin('evasive', s, { side });
    }
  }
  // Skilled Gunner and Signal Flags both want to know the best shots now.
  const shots = {};
  const shotOf = s => (s.id in shots ? shots[s.id] : (shots[s.id] = aiBestShot(s)));
  if (has('gunner') && coinTotal(p) >= reserve && !memo.used.gunner) {
    memo.used.gunner = 1;
    let best = null;
    for (const s of me.ships) {
      if (s.acted || s.gunner || s.noAction || roles[s.id] === 'collect') continue;
      const sh = shotOf(s);
      // Against Stone Hulls one ship firing twice is the way through.
      const need = (tactical(p) && !off('gunner') && sh && sh.target && G.factions[sh.target.owner] === 'stone_fleet' ? 3 : 4) - (spend ? 1 : 0);
      if (sh && sh.ev >= need && (!best || sh.ev > best.ev)) best = { s, ev: sh.ev };
    }
    if (best) return coin('gunner', best.s);
  }
  // Signal Flags: a ship with nothing useful to do hands its action to one
  // with a good shot, which then gets a second turn to fire or line up again.
  if (has('signal') && coinTotal(p) >= reserve && !memo.used.signal) {
    memo.used.signal = 1;
    const givers = coinTargets(p, 'signal').filter(s => roles[s.id] !== 'collect' && !touchingIslands(s).length && !(shotOf(s) && shotOf(s).ev >= 1.5));
    let best = null;
    for (const r of me.ships) {
      if (r.acted || r.noAction || isDead(r)) continue;
      const sh = shotOf(r);
      if (sh && sh.ev >= (spend ? 3 : 4) && (!best || sh.ev > best.ev)) best = { r, ev: sh.ev };
    }
    const giver = best && givers.find(g => g !== best.r);
    if (giver) return { t: 'coin', coin: 'signal', from: giver.id, target: best.r.id };
  }
  return null;
}

// ═══ Ship turns ════════════════════════════════════════

const islandAct = (ship, t, kind) => ({ t: kind, ship: ship.id, island: t.id });

function aiFireAction(ship, shot) {
  if (shot.target) { const m = aiMemo(ship.owner); m.hit[shot.target.id] = (m.hit[shot.target.id] || 0) + 1; }
  return { t: 'fire', ship: ship.id, source: shot.source, slot: shot.slotIdx, island: shot.island ? shot.island.id : null, h: shot.h, elev: shot.elev };
}

/**
 * One turn for one ship. The choices: an island action (the only way to
 * hold still), fire and then sail straight on, or steer and sail.
 */
function aiShipTurn(ship, roles) {
  const goal = roles[ship.id];
  if (ship.noAction) return aiSailOn(ship, roles);
  const touch = touchingIslands(ship).map(i => G.terrain[i]);
  for (const t of touch) if (!raiseFlagProblem(ship, t)) return islandAct(ship, t, 'raise');
  const own = touch.find(t => t.owner === ship.owner);
  const shot = aiBestShot(ship);
  // Collect only works for the ship nearest the island, once a turn.
  const canHold = own && !collectProblem(ship, own);
  if (isDead(ship)) {
    if (shot && shot.ev > 0.8) return aiFireAction(ship, shot);
    if (canHold) return islandAct(ship, own, 'collect');
    return { t: 'pass', ship: ship.id };
  }
  // Staying put at an island: collect, or use the island gun if it has a
  // better shot than the ship's own guns (both skip the forward click).
  if (own) {
    const isleShot = shot && shot.source === 'island' ? shot : null;
    const style = styleOf(ship.owner);
    // Tactical (v0.6): stay only as the island's keeper, or when it is the
    // last island and enemies are coming. Otherwise the ship goes to work.
    const nearIsle = enemyShips(ship.owner).some(e => !isDead(e) && dist(e.x, e.y, own.x, own.y) - own.r < 25);
    const tacKeep = goal === 'collect' || (islandsHeld(ship.owner) <= 1 && nearIsle);
    const keep = style === 'turtle' ? true : style === 'raider' ? (aiThreat(ship, ship) > 0 && ship.fit <= 1) : tactical(ship.owner) && !off('park') && passiveOf(ship.owner) !== 'harvest' ? tacKeep : goal === 'collect' || aiThreat(ship, ship) > 0 || islandsHeld(ship.owner) <= 1 || (tactical(ship.owner) && !off('keep') && typeof goal !== 'object');
    if (isleShot && isleShot.ev >= 3) return aiFireAction(ship, isleShot);
    // Firing the ship's own guns would mean sailing off the island after.
    const leave = style === 'turtle' ? 99 : style === 'raider' ? 2 : tactical(ship.owner) && !off('keep') ? 9 : 5;
    if (canHold && keep && !(shot && shot.source === 'ship' && shot.ev >= leave)) return islandAct(ship, own, 'collect');
  }
  const steer = aiBestMove(ship, goal, 1, ship.moveCount);
  const shipShot = shot ? shot.shipBest : null;
  // Out at sea, the ship nearest one of our islands may collect there and
  // sail straight on, when there is no shot and holding course costs little.
  if (!touch.length && !(shipShot && shipShot.ev >= 2)) {
    const spot = collectIslands(ship)[0];
    if (spot && G.bag.length) {
      const straight = aiBestMove(ship, goal, 1, ship.moveCount, true);
      if (straight && straight.score >= (steer ? steer.score : -99) - 10) return islandAct(ship, spot, 'collect');
    }
  }
  if (shipShot && shipShot.ev >= 2) {
    const straight = aiBestMove(ship, goal, 1, ship.moveCount, true);
    // Tactical: shoot early against fleets that punish waiting.
    const tw = tactical(ship.owner) && !off('aggr') ? aiIntel(ship.owner).tw : {};
    const aggr = 1 + 0.3 * ((tw.corsairs || 0) + (tw.queens_fleet || 0) + (tw.islanders || 0));
    const fireValue = shipShot.ev * 3 * aggr + (straight ? straight.score : -99);
    if (fireValue >= (steer ? steer.score : -Infinity) - 5) return aiFireAction(ship, shipShot);
  }
  if (canHold && (!steer || steer.score < aiEvalPose(ship, ship, goal) - 2)) return islandAct(ship, own, 'collect');
  if (steer) return { t: 'move', ship: ship.id, h: steer.h, clicks: steer.clicks };
  return { t: 'move', ship: ship.id, h: ship.h, clicks: 1 };
}

// ═══ Shot search ═══════════════════════════════════════

function aiHitValue(t, p) {
  // Every fitting knocked off is a point and a sunk hull two (rulebook v0.6).
  let v = 6 + VP_PRIZE_FITTING * 3;
  if (isDead(t)) v += 12 + VP_PRIZE_HULL * 2; // this hit sinks it
  else if (t.fit === 1) v += 4;           // this hit leaves it dead in the water
  v += (t.maxFit - t.fit) * 0.5;
  if (stoneShields(t)) v *= 0.35;
  else if (t.braced) v *= 0.4;
  if (p == null || !tactical(p) || off('hitv')) return v;
  const intel = aiIntel(p), memo = aiMemo(p), f = G.factions[t.owner], hitAlready = memo.hit[t.id] || 0;
  v *= intel.focus[t.owner] || 1;
  if (f === 'stone_fleet') { if (t.stoneUsed) v *= 1.6; if (hitAlready) v *= 1.3; }   // stack hits on one Stone ship
  else if (f === 'islanders') { if (!hitAlready) v *= 1.25; if (isDead(t)) v += 3; } // spread: one hit disables each
  else if (f === 'industry') { if (hasTurret(t) && !off('ind')) v *= 1.8; }         // the first hit silences the turret: very worth it
  else if (f === 'treasure_fleet') v *= 1.3;                                         // few hulls: punish them
  else if (f === 'shadow_fleet') { if (isDead(t) && coinTotal(t.owner) >= 2 && islandsHeld(t.owner) > 0) v -= 7; } // it will just come back
  else if (f === 'corsairs' || f === 'queens_fleet') v *= 1.1;
  return v;
}

/** Lanes this ship could fire along right now. */
function aiLanes(ship, opts) {
  const lanes = [];
  const enemies = enemyShips(ship.owner);
  shipSlots(ship).forEach((sl, idx) => {
    const w = slotWorld(ship, sl);
    if (sl.free) {
      // The turret swings to each enemy it can bear on (not through its blind cones).
      for (const e of enemies) { const h = headingTo(e.x - w.x, e.y - w.y); if (turretBears(ship, h)) lanes.push({ source: 'ship', slot: sl, slotIdx: idx, x: w.x, y: w.y, h }); }
    } else lanes.push({ source: 'ship', slot: sl, slotIdx: idx, x: w.x, y: w.y, h: w.h });
  });
  if (!(opts && opts.noIsland) && !isDead(ship)) {
    for (const i of touchingIslands(ship)) {
      const t = G.terrain[i];
      if (t.owner !== ship.owner) continue;
      islandSlots(t).forEach((sl, k) => {
        const o = islandGunOrigin(t, sl.h);
        lanes.push({ source: 'island', island: t, slot: sl, slotIdx: k, x: o.x, y: o.y, h: sl.h });
      });
    }
  }
  return lanes;
}

function aiLaneNearEnemy(lane, enemies) {
  const f = fwdVec(lane.h);
  return enemies.some(e => {
    const dx = e.x - lane.x, dy = e.y - lane.y;
    const along = dx * f.x + dy * f.y;
    const perp = Math.abs(dx * f.y - dy * f.x);
    return along > 0 && along < RANGE_MAX * 1.5 + e.len / 2 && perp < e.len / 2 + along * Math.tan(SPREAD_MAX) + 1;
  });
}

function aiBestShot(ship, opts) {
  const p = ship.owner;
  const enemies = enemyShips(p);
  if (!enemies.length) return null;
  let best = null, bestShip = null;
  for (const lane of aiLanes(ship, opts)) {
    if (!aiLaneNearEnemy(lane, enemies)) continue;
    const src = lane.source === 'island' ? { island: lane.island } : { ship };
    // Straight out hits the first thing in the lane; tipped up sails over
    // what is close and comes down about 38 cm out. Try both.
    for (const elev of ['flat', 'lob']) {
      const aim = traceShot(src, lane.x, lane.y, aimedShot(lane.h, elev));
      if (aim.kind === 'ship' && aim.obj.owner === p && elev === 'flat') continue; // our own hull is in the way
      // Monte Carlo with the cannon's spread, the spring and the table.
      let ev = 0;
      const N = AI_EFFORT.samples;
      for (let i = 0; i < N; i++) {
        const tr = traceShot(src, lane.x, lane.y, wobbleShot(lane.h, elev));
        if (tr.kind === 'ship' && tr.obj.owner !== p) ev += aiHitValue(tr.obj, p);
      }
      ev /= N;
      if (ev <= 0) continue;
      const cand = { ev, elev, h: lane.h, source: lane.source, slot: lane.slot, slotIdx: lane.slotIdx, island: lane.island, target: aim.kind === 'ship' && aim.obj.owner !== p ? aim.obj : null };
      if (!best || ev > best.ev) best = cand;
      if (lane.source === 'ship' && (!bestShip || ev > bestShip.ev)) bestShip = cand;
    }
  }
  if (best) best.shipBest = bestShip;
  return best;
}

// ═══ Move search ═══════════════════════════════════════

/** Enemy gun lanes, worked out once per decision (enemies do not move during our turn). */
// Kept outside G so it is never saved or sent to clients.
let LANES = { g: null, key: null, lanes: null };
function aiEnemyLanes(p) {
  const memo = aiMemo(p), key = `${G.turn}:${p}:${memo.step}`;
  if (LANES.g === G && LANES.key === key) return LANES.lanes;
  const out = [];
  for (const e of enemyShips(p)) {
    for (const sl of shipSlots(e)) {
      const w = slotWorld(e, sl);
      out.push({ e, x: w.x, y: w.y, fx: Math.sin(w.h), fy: -Math.cos(w.h), free: !!sl.free, eh: e.h });
    }
  }
  LANES = { g: G, key, lanes: out };
  return out;
}

/** Rough count of enemy lanes pointing at `pose`. */
function aiThreat(ship, ps) {
  let n = 0, lastE = null, counted = false;
  const reach = RANGE_MAX * 1.05;
  for (const L of aiEnemyLanes(ship.owner)) {
    if (L.e !== lastE) { lastE = L.e; counted = false; }
    if (counted) continue;
    const dx = ps.x - L.x, dy = ps.y - L.y;
    if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
    const d = Math.hypot(dx, dy);
    if (d > reach) continue;
    // A live turret can swing onto us from any side: a full threat in range.
    if (L.free) { if (d < RANGE_MAX * (off('ind') ? 0.8 : 1) && turretBears({ h: L.eh }, headingTo(dx, dy))) n += off('ind') ? 0.6 : 1; continue; }
    const along = dx * L.fx + dy * L.fy, perp = Math.abs(dx * L.fy - dy * L.fx);
    if (along > 4 && perp < ship.len / 2 + 0.5) { n += 1; counted = true; }
  }
  return n;
}

function aiAttackPotential(ship, ps) {
  let sc = 0;
  const ghost = Object.assign({}, ship, ps);
  const slots = shipSlots(ghost).map(sl => Object.assign(slotWorld(ghost, sl), { free: sl.free }));
  const reach = RANGE_MAX + 10;
  for (const e of enemyShips(ship.owner)) {
    if (Math.abs(e.x - ps.x) > reach || Math.abs(e.y - ps.y) > reach) continue;
    let bestE = 0;
    for (const w of slots) {
      const dx = e.x - w.x, dy = e.y - w.y;
      if (w.free) { if (Math.hypot(dx, dy) < RANGE_MAX * 0.8 && turretBears(ghost, headingTo(dx, dy))) bestE = Math.max(bestE, 0.8); continue; }
      const fx = Math.sin(w.h), fy = -Math.cos(w.h);
      const along = dx * fx + dy * fy, perp = Math.abs(dx * fy - dy * fx);
      if (along > RANGE_MIN && along < RANGE_MAX && perp < e.len / 2 + 1) bestE = Math.max(bestE, 1 - perp / (e.len / 2 + 1));
    }
    sc += bestE * (isDead(e) ? 1.6 : 1);
  }
  return sc;
}

/**
 * How badly a pose sets up the next turn's forced click. Next turn the
 * ship can steer up to its pivot and must then sail at least one click,
 * so it needs room ahead on some heading it can reach.
 */
function aiEdgeRisk(ship, ps) {
  const piv = pivotFor(ship) * Math.PI / 180;
  let bestRoom = 0;
  for (const k of [0, -0.5, 0.5, -1, 1]) {
    const h = ps.h + k * piv;
    const f = fwdVec(h);
    const bx = ps.x + f.x * ship.len / 2, by = ps.y + f.y * ship.len / 2;
    if (!onTable(bx, by)) continue;
    bestRoom = Math.max(bestRoom, rayExit(bx, by, f.x, f.y) - ship.wid / 2);
    if (bestRoom > CLICK_LEN * 2) break;
  }
  // The edge only wastes a turn now (no scuttle), but a ship stuck facing
  // it can't get anywhere.
  if (bestRoom < CLICK_LEN * 0.5) return 14;
  if (bestRoom < CLICK_LEN * 1.2) return 6;
  if (bestRoom < CLICK_LEN * 2) return 2;
  return 0;
}

function aiEvalPose(ship, ps, goal) {
  const p = ship.owner;
  const enemies = enemyShips(p);
  let sc = 0;
  const fragile = ship.fit <= 1 && ship.maxFit > 1;
  const touching = touchingIslands(ship, ps).map(i => G.terrain[i]);
  if (goal && typeof goal === 'object') {
    if (touching.includes(goal)) sc += opponents(p).some(q => defendersAt(goal, q).length) ? 18 : 45;
    else sc -= Math.max(0, dist(ps.x, ps.y, goal.x, goal.y) - goal.r - ship.len / 2) * 0.9;
  } else if (goal === 'collect') {
    if (!touching.some(t => t.owner === p)) sc -= 30;
  } else if (enemies.length) {
    const near = enemies.reduce((m, o) => Math.min(m, dist(ps.x, ps.y, o.x, o.y)), Infinity);
    sc -= Math.abs(near - 24) * 0.5;
  }
  if (touching.some(t => t.owner !== p)) sc += 6;
  sc += aiAttackPotential(ship, ps) * 10;
  sc -= aiThreat(ship, ps) * (fragile ? 12 : 5);
  const coins = G.players[p].coins;
  const ghost = Object.assign({}, ship, ps);
  for (const o of enemies) {
    if (!shipsTouching(ghost, o)) continue;
    if (isDead(o) && coins.boarding && coins.repair) sc += 25;
    else if (!isDead(o) && coins.boarding) sc += 6;
  }
  if (tactical(p) && !off('pose')) sc += aiTacticalPose(ship, ps, goal, enemies, coins);
  if (edgeGapOfSeg(shipSeg(ship, ps)) < 3) sc -= 6;
  sc -= aiEdgeRisk(ship, ps);
  return sc + rand() * 1.5;
}

/** Spacing and approach by enemy fleet (tactical style). */
function aiTacticalPose(ship, ps, goal, enemies, coins) {
  let sc = 0;
  for (const e of enemies) {
    const d = dist(ps.x, ps.y, e.x, e.y);
    if (d > 60) continue;
    const f = G.factions[e.owner];
    const bearing = headingTo(ps.x - e.x, ps.y - e.y);
    if (f === 'corsairs' && d < 12 && !isDead(e) && !off('pc')) sc -= 5 * (1 - d / 12);                               // stay out of boarding reach
    else if (f === 'industry' && !isDead(e) && d < 45 && !off('pi') && Math.abs(angleDiff(bearing, e.h)) < 0.35) sc -= 3; // keep off the bow gun
    else if (f === 'islanders' && d < 35 && !off('ps') && Math.abs(angleDiff(bearing, e.h + Math.PI)) < 0.4) sc -= 2;   // not right behind them: stern guns
    else if (f === 'treasure_fleet' && coins.boarding && shipsTouching(Object.assign({}, ship, ps), e)) sc += 8;
  }
  return sc;
}

/**
 * Try headings across the pivot arc and click counts from lo to hi.
 * straight = keep the current heading (after firing, or no action).
 */
function aiBestMove(ship, goal, lo, hi, straight) {
  const piv = pivotFor(ship);
  const n = straight ? 0 : piv >= 180 ? AI_EFFORT.headings * 2 : AI_EFFORT.headings;
  const stepA = n ? (piv * Math.PI / 180) / n : 0;
  const clickSet = [...new Set([lo, Math.round((lo + hi) / 2), hi])].filter(c => c >= lo && c <= hi);
  let best = null;
  for (let k = -n; k <= n; k++) {
    // One rotation and one sweep to the longest run per heading; shorter
    // runs are the same track cut short.
    const rot = planRotate(ship, normAngle(ship.h + k * stepA), piv);
    const start = { x: ship.x, y: ship.y, h: rot.h };
    const slide = planSlide(ship, start, rot.h, hi * CLICK_LEN);
    const f = fwdVec(rot.h);
    for (const c of clickSet) {
      const d = Math.min(c * CLICK_LEN, slide.moved);

      const end = { x: start.x + f.x * d, y: start.y + f.y * d, h: rot.h };
      let score = aiEvalPose(ship, end, goal);
      if (d < 0.3) score -= 4;
      if (!best || score > best.score) best = { h: rot.h, clicks: c, score };
    }
  }
  return best;
}
