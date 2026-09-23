// Cannons & Coastlines, digital edition: brain.js
// Computer captain. aiNextAction(p) looks at G and returns the next action
// for seat p, in the same format a player sends (see rules.js). It never
// changes the state itself, so it can run in the browser or on the server
// and always plays by the same rules as everyone else.

const AI_TIMING_SD = 0.08;   // how well the computer times the power ring
// Search effort. The server runs on a tight CPU budget, so it looks at
// fewer landing distances, samples and headings.
let AI_EFFORT = { dStep: 1.5, samples: 14, headings: 6 };
function setAiEffort(level) {
  AI_EFFORT = level === 'lite' ? { dStep: 3, samples: 6, headings: 3 } : { dStep: 1.5, samples: 14, headings: 6 };
}

function aiMemo(p) {
  if (!G.ai || G.ai.turn !== G.turn || G.ai.p !== p) G.ai = { turn: G.turn, p, used: {}, roles: null, order: null };
  return G.ai;
}

function aiNextAction(p) {
  const memo = aiMemo(p);
  const ships = G.players[p].ships;
  if (canDeclareVictory(p)) return { t: 'declare' };
  if (!memo.roles) memo.roles = aiAssignRoles(p);
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
      const hurt = s.fit === 0 || s.fit <= s.maxFit - 2 || (s.fit < s.maxFit && s.fit <= 1);
      if (hurt && coinTargets(p, 'repair').includes(s)) { memo.used['repair' + s.id] = 1; return coin('repair', s); }
    }
  }
  if (has('brace')) {
    for (const s of me.ships) if (s.fit <= 1 && !s.braced && aiThreat(s, s) > 0) return coin('brace', s);
  }
  if (has('evasive')) {
    for (const s of me.ships) {
      if (isDead(s) || memo.used['ev' + s.id]) continue;
      memo.used['ev' + s.id] = 1;
      const plans = evasivePlans(s);
      // Slide a fragile ship out of a lane, or away from an edge it faces.
      const fragile = s.fit <= 1 && aiThreat(s, s) > 0;
      const cornered = aiEdgeRisk(s, s) >= 30;
      if (!fragile && !cornered) continue;
      const side = ['port', 'stbd'].find(k => plans[k].moved > s.wid * 0.8 &&
        (fragile ? aiThreat(s, plans[k].end) === 0 : aiEdgeRisk(s, Object.assign({}, plans[k].end, { h: s.h })) < 30));
      if (side) return coin('evasive', s, { side });
    }
  }
  // Skilled Gunner and Signal Flags both want to know the best shots now.
  const shots = {};
  const shotOf = s => (s.id in shots ? shots[s.id] : (shots[s.id] = aiBestShot(s)));
  if (has('gunner') && coinTotal(p) >= 3 && !memo.used.gunner) {
    memo.used.gunner = 1;
    let best = null;
    for (const s of me.ships) {
      if (s.acted || s.gunner || s.noAction || roles[s.id] === 'collect') continue;
      const sh = shotOf(s);
      if (sh && sh.ev >= 4 && (!best || sh.ev > best.ev)) best = { s, ev: sh.ev };
    }
    if (best) return coin('gunner', best.s);
  }
  // Signal Flags: a ship with nothing useful to do hands its action to one
  // with a good shot, which then gets a second turn to fire or line up again.
  if (has('signal') && coinTotal(p) >= 3 && !memo.used.signal) {
    memo.used.signal = 1;
    const givers = coinTargets(p, 'signal').filter(s => roles[s.id] !== 'collect' && !touchingIslands(s).length && !(shotOf(s) && shotOf(s).ev >= 1.5));
    let best = null;
    for (const r of me.ships) {
      if (r.acted || r.noAction || isDead(r)) continue;
      const sh = shotOf(r);
      if (sh && sh.ev >= 4 && (!best || sh.ev > best.ev)) best = { r, ev: sh.ev };
    }
    const giver = best && givers.find(g => g !== best.r);
    if (giver) return { t: 'coin', coin: 'signal', from: giver.id, target: best.r.id };
  }
  return null;
}

// ═══ Ship turns ════════════════════════════════════════

const islandAct = (ship, t, kind) => ({ t: kind, ship: ship.id, island: t.id });

function aiFireAction(ship, shot) {
  const D = clamp(shot.D * (1 + gaussRandom() * AI_TIMING_SD), RANGE_MIN, RANGE_MAX);
  return { t: 'fire', ship: ship.id, source: shot.source, slot: shot.slotIdx, island: shot.island ? shot.island.id : null, h: shot.h, D, aimD: shot.D };
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
  if (isDead(ship)) {
    if (shot && shot.ev > 0.8) return aiFireAction(ship, shot);
    if (own) return islandAct(ship, own, 'collect');
    return { t: 'pass', ship: ship.id };
  }
  // Staying put at an island: collect, or use the island gun if it has a
  // better shot than the ship's own guns (both skip the forward click).
  if (own) {
    const isleShot = shot && shot.source === 'island' ? shot : null;
    const keep = goal === 'collect' || aiThreat(ship, ship) > 0 || islandsHeld(ship.owner) <= 1;
    if (isleShot && isleShot.ev >= 3) return aiFireAction(ship, isleShot);
    if (keep && !(shot && shot.ev >= 5)) return islandAct(ship, own, 'collect');
  }
  const steer = aiBestMove(ship, goal, 1, ship.moveCount);
  const shipShot = shot ? shot.shipBest : null;
  if (shipShot && shipShot.ev >= 2) {
    const straight = aiBestMove(ship, goal, 1, ship.moveCount, true);
    const fireValue = shipShot.ev * 3 + (straight ? straight.score : -99);
    if (fireValue >= (steer ? steer.score : -Infinity) - 5) return aiFireAction(ship, shipShot);
  }
  if (own && (!steer || steer.score < aiEvalPose(ship, ship, goal) - 2)) return islandAct(ship, own, 'collect');
  if (steer) return { t: 'move', ship: ship.id, h: steer.h, clicks: steer.clicks };
  return { t: 'move', ship: ship.id, h: ship.h, clicks: 1 };
}

// ═══ Shot search ═══════════════════════════════════════

function aiHitValue(t) {
  let v = 6;
  if (isDead(t)) v += 12;                 // this hit sinks it
  else if (t.fit === 1) v += 4;           // this hit leaves it dead in the water
  v += (t.maxFit - t.fit) * 0.5;
  if (passiveOf(t.owner) === 'stone' && !t.stoneUsed) v *= 0.35;
  else if (t.braced) v *= 0.4;
  return v;
}

/** Lanes this ship could fire along right now. */
function aiLanes(ship, opts) {
  const lanes = [];
  const enemies = enemyShips(ship.owner);
  shipSlots(ship).forEach((sl, idx) => {
    const w = slotWorld(ship, sl);
    if (sl.free) {
      for (const e of enemies) lanes.push({ source: 'ship', slot: sl, slotIdx: idx, x: w.x, y: w.y, h: headingTo(e.x - w.x, e.y - w.y) });
    } else lanes.push({ source: 'ship', slot: sl, slotIdx: idx, x: w.x, y: w.y, h: w.h });
  });
  if (!(opts && opts.noIsland)) {
    for (const i of touchingIslands(ship)) {
      const t = G.terrain[i];
      if (t.owner !== ship.owner) continue;
      for (const e of enemies) {
        const h = headingTo(e.x - t.x, e.y - t.y);
        const o = islandGunOrigin(t, h);
        lanes.push({ source: 'island', island: t, x: o.x, y: o.y, h });
      }
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
    return along > 0 && along < RANGE_MAX * (1 + ROLL_K) + e.len / 2 && perp < e.len / 2 + 1;
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
    let run = null;
    const windows = [];
    for (let D = RANGE_MIN; D <= RANGE_MAX + 0.01; D += AI_EFFORT.dStep) {
      const tr = traceShot(src, lane.x, lane.y, lane.h, D);
      const hitEnemy = tr.kind === 'ship' && tr.obj.owner !== p ? tr.obj : null;
      if (hitEnemy && run && run.t === hitEnemy) run.hi = D;
      else { if (run) windows.push(run); run = hitEnemy ? { t: hitEnemy, lo: D, hi: D } : null; }
    }
    if (run) windows.push(run);
    for (const w of windows) {
      const D = (w.lo + w.hi) / 2;
      // Monte Carlo with the computer's timing error and the cannon's wobble.
      let ev = 0;
      const N = AI_EFFORT.samples;
      for (let i = 0; i < N; i++) {
        const wob = wobbleShot(lane.h, D * (1 + gaussRandom() * AI_TIMING_SD));
        const tr = traceShot(src, lane.x, lane.y, wob.h, wob.D, wob.b);
        if (tr.kind === 'ship' && tr.obj.owner !== p) ev += aiHitValue(tr.obj);
      }
      ev /= N;
      const cand = { ev, D, h: lane.h, source: lane.source, slot: lane.slot, slotIdx: lane.slotIdx, island: lane.island, target: w.t };
      if (!best || ev > best.ev) best = cand;
      if (lane.source === 'ship' && (!bestShip || ev > bestShip.ev)) bestShip = cand;
    }
  }
  if (best) best.shipBest = bestShip;
  return best;
}

// ═══ Move search ═══════════════════════════════════════

/** Rough count of enemy lanes pointing at `pose`. */
function aiThreat(ship, ps) {
  let n = 0;
  const reach = RANGE_MAX * 1.05 + 8;
  for (const e of enemyShips(ship.owner)) {
    if (Math.abs(e.x - ps.x) > reach || Math.abs(e.y - ps.y) > reach) continue;
    for (const sl of shipSlots(e)) {
      const w = slotWorld(e, sl);
      const dx = ps.x - w.x, dy = ps.y - w.y;
      const d = Math.hypot(dx, dy);
      if (d > RANGE_MAX * 1.05) continue;
      if (sl.free) { if (d < RANGE_MAX * 0.8) n += 0.6; continue; }
      const fx = Math.sin(w.h), fy = -Math.cos(w.h);
      const along = dx * fx + dy * fy, perp = Math.abs(dx * fy - dy * fx);
      if (along > 4 && perp < ship.len / 2 + 0.5) { n += 1; break; }
    }
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
      if (w.free) { if (Math.hypot(dx, dy) < RANGE_MAX * 0.8) bestE = Math.max(bestE, 0.8); continue; }
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
  if (bestRoom < CLICK_LEN * 0.5) return 60;   // likely scuttled next turn
  if (bestRoom < CLICK_LEN * 1.2) return 30;
  if (bestRoom < CLICK_LEN * 2) return 6;
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
  if (edgeGapOfSeg(shipSeg(ship, ps)) < 3) sc -= 6;
  sc -= aiEdgeRisk(ship, ps);
  return sc + rand() * 1.5;
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
      if (slide.stoppedBy === 'edge' && d < 0.05) continue; // would be scuttled
      const end = { x: start.x + f.x * d, y: start.y + f.y * d, h: rot.h };
      let score = aiEvalPose(ship, end, goal);
      if (d < 0.3) score -= 4;
      if (!best || score > best.score) best = { h: rot.h, clicks: c, score };
    }
  }
  return best;
}
