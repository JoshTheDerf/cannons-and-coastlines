// Cannons & Coastlines, digital edition: rules.js
// The rules engine (rulebook v0.5). act(p, action) checks that seat p may do
// `action` right now, applies it to G and returns the events that happened,
// in order. Clients animate the events; the online server runs this same
// file as the authority, so a client can only ever ask, never decide.
//
// A ship's turn: one action (Set Heading, Fire, or an Island action if it
// touches an island), then it clicks forward 1 to Move Count. An Island
// action skips the click. Dead ships skip the click but may still fire.
// No ship both steers and fires on the same turn.
//
// Actions (ids are strings or numbers from the state):
//   { t: 'move', ship, h, clicks }     steer (if the turn has not started) and click
//   { t: 'fire', ship, source: 'ship'|'island', slot, island, h, D }
//   { t: 'skipShot', ship }            { t: 'pass', ship }      (dead ships only)
//   { t: 'raise', ship, island }       { t: 'collect', ship, island }
//   { t: 'scuttle', ship }
//   { t: 'coin', coin, target, from, side }   (Signal Flags: from = giving ship)
//   { t: 'revive', island }            { t: 'declare' }       { t: 'endTurn' }

let EV = null;
function ev(e) { EV.push(e); return e; }
function note(msg) { ev({ e: 'msg', msg }); }
class RuleError extends Error {}
function need(cond, msg) { if (!cond) throw new RuleError(msg); }

function act(p, a) {
  EV = [];
  try {
    need(G && G.phase === 'play', 'The game is not running.');
    need(G.active === p, 'It is not your turn.');
    need(a && typeof a.t === 'string', 'Unknown action.');
    const fn = ACTIONS[a.t];
    need(fn, 'Unknown action.');
    fn(p, a);
    // A seat that just lost its last ship hands the turn on.
    if (G.phase === 'play' && a.t !== 'endTurn' && !inGame(G.active)) ACTIONS.endTurn(G.active);
    if (G.phase === 'over') ev({ e: 'over', winner: G.winner, reason: G.endReason });
    return { ok: true, events: EV };
  } catch (err) {
    if (err instanceof RuleError) return { ok: false, err: err.message, events: [] };
    throw err;
  } finally {
    EV = null;
  }
}

function ownShip(p, id) {
  const s = shipById(id);
  need(s && s.owner === p, 'That is not your ship.');
  return s;
}
function islandById(id) {
  const t = G.terrain[id];
  need(t && t.type === 'island', 'No such island.');
  return t;
}
const pose = s => ({ x: s.x, y: s.y, h: s.h });
const snapShip = s => ({ id: s.id, owner: s.owner, build: s.build, name: s.name, len: s.len, wid: s.wid, guns: s.guns, hullStyle: s.hullStyle, maxFit: s.maxFit, fit: s.fit, fitMask: fitMaskOf(s).slice(), turretRel: s.turretRel || 0, x: s.x, y: s.y, h: s.h });
const hitWords = res => ({ stone: 'stone hull shrugs it off', brace: 'brace absorbs it', fitting: 'a fitting is lost', dead: 'dead in the water', sunk: 'sunk' }[res] || res);

/** Has this ship not started its current turn yet? */
function turnFresh(s) { return !s.acted && s.stage === 'action' && !s.pending; }
/** May it take an action (steer, fire, island) on this turn? */
function canAct(s) { return turnFresh(s) && !s.noAction; }
/** May it steer on this turn? Only before acting, and not a ship that gave its action away. */
function canSteer(s) { return canAct(s) && !isDead(s); }

/** End the ship's current turn; a Signal Flags receiver may have another. */
function finishTurn(s) {
  s.pending = null; s.shotsDone = 0;
  s.turnsLeft = Math.max(0, (s.turnsLeft || 1) - 1);
  s.noAction = false; // a giver only gives up one action
  if (s.turnsLeft > 0) s.stage = 'action';
  else { s.stage = null; s.acted = true; }
}

// ─── Moving ───────────────────────────────────────────

/** Click forward (after steering to h if allowed). Returns false if the ship is gone. */
function doMove(ship, h, clicks, why) {
  G.coinPhase = false;
  const plan = planMove(ship, h, clicks, pivotFor(ship));
  const from = pose(ship);
  ship.x = plan.end.x; ship.y = plan.end.y; ship.h = plan.rot.h;
  ev({ e: 'move', ship: ship.id, from, plan: { rot: { h: plan.rot.h }, start: plan.start, end: plan.end, moved: plan.moved, planned: plan.planned, stoppedBy: plan.stoppedBy, clicks } });
  if (why) note(why);
  // The table edge just stops a ship; one already against it and facing
  // off the table stays put this turn. No damage either way.
  if (plan.stoppedBy === 'edge' && plan.moved < 0.05) { note(`${ship.name} is up against the edge and does not move.`); return true; }
  if (plan.stoppedBy && plan.moved < plan.planned - 0.05) {
    const what = { ship: 'a ship', island: 'an island', terrain: plan.obj ? (plan.obj.type === 'rock' ? 'a rock' : 'a reef') : 'terrain', edge: 'the table edge' }[plan.stoppedBy];
    note(`${ship.name} stops against ${what}.`);
  }
  return true;
}

const ACTIONS = {};

ACTIONS.move = (p, a) => {
  const s = ownShip(p, a.ship);
  need(!isDead(s), 'A dead ship cannot move. It may still fire.');
  need(!s.acted && (s.stage === 'action' || s.stage === 'click') && !s.pending, 'This ship has finished its turn.');
  const clicks = clamp(Math.round(+a.clicks || 1), 1, s.moveCount);
  // Steering is the action, so only a ship that has not fired may turn.
  const h = canSteer(s) ? normAngle(+a.h || 0) : s.h;
  if (doMove(s, h, clicks)) finishTurn(s);
};

// ─── Firing ───────────────────────────────────────────

function fireOriginFor(ship, F) {
  if (F.source === 'island') return islandGunOrigin(F.island, F.h);
  const w = slotWorld(ship, F.slot);
  return { x: w.x, y: w.y, h: F.slot.free ? F.h : w.h };
}

/** Firing is done: island guns and dead ships end the turn, a ship at sea still clicks. */
function finishFiring(ship, source) {
  ship.pending = null;
  ship.gunner = false; // Skilled Gunner covers a single turn
  if (source === 'island' || isDead(ship)) finishTurn(ship);
  else ship.stage = 'click';
}

ACTIONS.fire = (p, a) => {
  const s = ownShip(p, a.ship);
  const again = s.pending === 'shot2';
  need(again || canAct(s), s.noAction ? 'This ship gave its action away. It only sails forward.' : 'This ship has already acted this turn.');
  const F = { source: a.source === 'island' ? 'island' : 'ship', h: normAngle(+a.h || 0) };
  if (F.source === 'island') {
    F.island = islandById(a.island);
    need(F.island.owner === p, 'Only an island you hold has a gun for you.');
    need(shipTouchesTerrain(s, F.island), 'Cannons need a crew: a ship must be touching the island.');
  } else {
    F.slot = shipSlots(s)[a.slot | 0];
    need(F.slot, 'No such cannon slot.');
    // Turning the turret is part of firing it, not Set Heading, so any
    // angle is fine. The hull itself does not turn.
    if (F.slot.free) s.turretRel = normAngle(F.h - s.h);
  }
  const D = clamp(+a.D || RANGE_MIN, RANGE_MIN, RANGE_MAX);
  G.coinPhase = false;
  const o = fireOriginFor(s, F);
  const src = F.source === 'island' ? { island: F.island } : { ship: s };
  const wob = wobbleShot(o.h, D);
  const tr = traceShot(src, o.x, o.y, wob.h, wob.D, wob.b);
  G.stats[p].shots++;
  const shot = ev({ e: 'shot', ship: s.id, origin: { x: o.x, y: o.y }, h: wob.h, D: wob.D, b: wob.b, stopS: tr.s, kind: tr.kind, x: tr.x, y: tr.y });
  if (tr.kind === 'ship') {
    const t = tr.obj;
    shot.target = t.id;
    if (t.owner === p) {
      shot.friendly = true;
      shot.msg = `The shot hits ${t.name} first. No damage.`;
    } else {
      const res = applyHit(t);
      shot.res = res; shot.fitAfter = t.fit; shot.mask = fitMaskOf(t).slice();
      if (res === 'fitting' || res === 'dead') shot.lost = t.lastLost;
      if (res === 'sunk') { shot.wreck = snapShip(t); G.stats[p].sunk++; }
      if (res !== 'stone' && res !== 'brace') G.stats[p].hits++;
      shot.msg = `${s.name} hits ${t.name}: ${hitWords(res)}.`;
    }
  } else if (tr.kind === 'terrain') shot.msg = `The shot hits ${tr.obj.type === 'island' ? 'an island' : 'a ' + tr.obj.type}.`;
  else if (tr.kind === 'edge') shot.msg = 'The shot rolls off the table.';
  else shot.msg = 'Miss.';
  checkLastFleet();
  s.shotsDone = (s.shotsDone || 0) + 1;
  s.lastSource = F.source; s.lastIsland = F.island ? F.island.id : null;
  if (s.gunner && s.shotsDone < 2 && G.phase === 'play' && G.players[p].ships.includes(s)) { s.pending = 'shot2'; s.stage = 'action'; }
  else if (G.players[p].ships.includes(s)) finishFiring(s, F.source);
};

ACTIONS.skipShot = (p, a) => {
  const s = ownShip(p, a.ship);
  need(s.pending === 'shot2', 'No second shot to skip.');
  finishFiring(s, s.lastSource || 'ship');
};

ACTIONS.pass = (p, a) => {
  const s = ownShip(p, a.ship);
  need(isDead(s), 'Every ship sails forward. Only a dead ship can sit out its turn.');
  need(!s.acted && !s.pending, 'This ship has finished its turn.');
  finishTurn(s);
};

// ─── Islands ──────────────────────────────────────────

function islandActionCheck(s, t) {
  need(canAct(s), s.noAction ? 'This ship gave its action away. It only sails forward.' : 'This ship has already acted this turn.');
  need(shipTouchesTerrain(s, t), 'The ship is not touching that island.');
}

ACTIONS.raise = (p, a) => {
  const s = ownShip(p, a.ship), t = islandById(a.island);
  islandActionCheck(s, t);
  const why = raiseFlagProblem(s, t);
  need(!why, why);
  G.coinPhase = false;
  setFlag(t, p);
  finishTurn(s);
  ev({ e: 'flag', island: t.id, p, ship: s.id, msg: `${s.name} raises the flag.` });
  plunder(p, s);
};

ACTIONS.collect = (p, a) => {
  const s = ownShip(p, a.ship), t = islandById(a.island);
  islandActionCheck(s, t);
  need(t.owner === p, 'You can only collect from an island you hold.');
  G.coinPhase = false;
  const n = passiveOf(p) === 'harvest' ? 2 : 1;
  const got = [];
  for (let i = 0; i < n; i++) { const id = drawCoin(p); if (id) got.push(id); }
  finishTurn(s);
  ev({ e: 'collect', p, ship: s.id, island: t.id, got, msg: got.length ? `${s.name} collects: ${got.map(id => COIN_DEFS[id].short).join(', ')}.` : 'The bag is empty.' });
};

ACTIONS.scuttle = (p, a) => {
  const s = ownShip(p, a.ship);
  need(isDead(s), 'Only a dead ship can be scuttled.');
  ev({ e: 'sink', ship: snapShip(s), msg: `${s.name} is scuttled.` });
  sinkShip(s);
  checkLastFleet();
};

// ─── Coins ────────────────────────────────────────────

function coinWindowOpen(p) {
  return G && G.phase === 'play' && G.active === p && G.coinPhase;
}

function touchingOwnShip(p, target) {
  return G.players[p].ships.some(s => s !== target && shipsTouching(s, target));
}

/** Ships that can take the second half of a Signal Flags transfer from `giver`. */
function signalReceivers(p, giver) {
  // No allies online or in local games, so the receiver is one of yours.
  return G.players[p].ships.filter(s => s !== giver && !s.noAction && !s.acted);
}

/**
 * Ships that `coinId` could be played on right now by seat p.
 * For Signal Flags these are the ships that can give up their action.
 */
function coinTargets(p, coinId) {
  if (!coinWindowOpen(p) || !G.players[p].coins[coinId]) return [];
  const mine = G.players[p].ships, theirs = enemyShips(p);
  const coins = G.players[p].coins;
  switch (coinId) {
    case 'brace': return mine.filter(s => !s.braced);
    case 'signal': return mine.filter(s => !isDead(s) && canAct(s) && (s.turnsLeft || 1) === 1 && signalReceivers(p, s).length > 0);
    case 'evasive': return mine.filter(s => !isDead(s));
    case 'gunner': return mine.filter(s => !s.acted && !s.gunner && !s.noAction);
    case 'repair': {
      const own = mine.filter(s => s.fit < s.maxFit && (s.fit > 0 || touchingOwnShip(p, s)));
      const caps = coins.boarding > 0 ? theirs.filter(s => isDead(s) && touchingOwnShip(p, s)) : [];
      return own.concat(caps);
    }
    case 'boarding':
      return theirs.filter(s => touchingOwnShip(p, s) && (!isDead(s) || coins.repair > 0));
  }
  return [];
}

function plunder(p, ship) {
  if (passiveOf(p) !== 'plunder') return;
  const id = drawCoin(p);
  if (id) ev({ e: 'plunder', p, ship: ship.id, coin: id, x: ship.x, y: ship.y });
}

function evasivePlans(s) {
  return {
    port: planSlide(s, s, normAngle(s.h - Math.PI / 2), s.wid),
    stbd: planSlide(s, s, normAngle(s.h + Math.PI / 2), s.wid),
  };
}

function boarder(p, target) { return G.players[p].ships.find(s => s !== target && shipsTouching(s, target)); }

function capture(p, target) {
  payCoin(p, 'boarding');
  payCoin(p, 'repair');
  const from = boarder(p, target);
  const list = G.players[target.owner].ships;
  list.splice(list.indexOf(target), 1);
  if (target.braced) { target.braced = false; G.bag.push('brace'); }
  const was = target.owner;
  target.owner = p;
  oneFitting(target);
  // It joins the fleet and may act on the following turn.
  target.acted = true; target.turnsLeft = 0; target.stage = null;
  target.pending = null; target.noAction = false; target.gunner = false;
  target.touchPrev = [];
  G.players[p].ships.push(target);
  ev({ e: 'capture', p, was, ship: target.id, from: from.id, msg: `${target.name} captured! It joins the fleet next turn.` });
  plunder(p, target);
  checkLastFleet();
}

ACTIONS.coin = (p, a) => {
  need(coinWindowOpen(p), 'Coins are spent at the start of the turn, before any ship acts.');
  const id = a.coin;
  need(COIN_DEFS[id], 'Unknown coin.');
  need(G.players[p].coins[id] > 0, `You have no ${COIN_DEFS[id].name}.`);
  if (id === 'signal') {
    const giver = shipById(a.from), target = shipById(a.target);
    need(giver && coinTargets(p, 'signal').includes(giver), 'That ship cannot give up its action.');
    need(target && signalReceivers(p, giver).includes(target), 'That ship cannot take the extra turn.');
    payCoin(p, id);
    giver.noAction = true;
    target.turnsLeft = (target.turnsLeft || 1) + 1;
    ev({ e: 'coin', p, coin: id, ship: target.id, from: giver.id, msg: `Signal flags: ${giver.name} only sails, ${target.name} takes ${target.turnsLeft} turns.` });
    return;
  }
  const target = shipById(a.target);
  need(target && coinTargets(p, id).includes(target), `${COIN_DEFS[id].name} cannot go on that ship.`);
  const at = { e: 'coin', p, coin: id, ship: target.id };
  switch (id) {
    case 'brace':
      payCoin(p, 'brace', true); // stays on the ship until it stops a hit
      target.braced = true;
      ev(Object.assign(at, { msg: `${target.name} braces for impact.` }));
      break;
    case 'gunner':
      payCoin(p, id); target.gunner = true;
      ev(Object.assign(at, { msg: `${target.name} will fire twice.` }));
      break;
    case 'repair':
      if (target.owner !== p) { capture(p, target); break; }
      {
        // Fittings go back in reverse loss order: masts first, turret last.
        const idx = nextToRestore(target);
        payCoin(p, id);
        gainFitting(target, idx);
        const what = fittingLayout(target)[idx].kind === 'turret' ? 'turret back on' : `${target.fit}/${target.maxFit}`;
        ev(Object.assign(at, { fit: target.fit, mask: fitMaskOf(target).slice(), idx, msg: `${target.name} repaired (${what}).` }));
      }
      break;
    case 'boarding': {
      if (isDead(target)) { capture(p, target); break; }
      payCoin(p, id);
      const from = boarder(p, target);
      const res = applyHit(target);
      const e = ev({ e: 'board', p, from: from.id, ship: target.id, res, fitAfter: target.fit, mask: fitMaskOf(target).slice(), lost: target.lastLost, msg: `Boarding party on ${target.name}: ${hitWords(res)}.` });
      if (res === 'sunk') e.wreck = snapShip(target);
      if (res === 'fitting' || res === 'dead' || res === 'sunk') { G.stats[p].hits++; plunder(p, from); }
      checkLastFleet();
      break;
    }
    case 'evasive': {
      const side = a.side === 'port' ? 'port' : 'stbd';
      const plan = evasivePlans(target)[side];
      payCoin(p, id);
      const from = pose(target);
      target.x = plan.end.x; target.y = plan.end.y;
      ev({ e: 'slide', p, ship: target.id, from, to: pose(target), msg: `${target.name} slides to ${side === 'port' ? 'port' : 'starboard'}.` });
      break;
    }
  }
};

// ─── Shadow Fleet: Return from the Deep ───────────────

function reviveAllowed(p) {
  return coinWindowOpen(p) && passiveOf(p) === 'deep' && G.players[p].sunk.length > 0 &&
    coinTotal(p) >= 2 && islandsHeld(p) > 0;
}

function freePoseAtIsland(ship, t) {
  for (let k = 0; k < 36; k++) {
    const ang = k * TAU / 36;
    const f = fwdVec(ang);
    for (const end of [false, true]) {
      const half = end ? ship.len / 2 : ship.wid / 2;
      const facing = end ? ang + Math.PI : ang + Math.PI / 2;
      const ps = { x: t.x + f.x * (t.r + half + 0.1), y: t.y + f.y * (t.r + half + 0.1), h: normAngle(facing) };
      if (poseGap(ship, ps).gap >= -COLLIDE_EPS && touchingIslands(ship, ps).includes(t.id)) return ps;
    }
  }
  return null;
}

ACTIONS.revive = (p, a) => {
  need(reviveAllowed(p), 'You cannot raise a ship right now.');
  const t = islandById(a.island);
  need(t.owner === p, 'Raise it at an island you hold.');
  const ship = G.players[p].sunk[0];
  const ps = freePoseAtIsland(ship, t);
  need(ps, 'No room at that island.');
  // Pay with the two coins you hold most of, so a mixed hand stays mixed.
  for (let k = 0; k < 2; k++) {
    const id = COIN_ORDER.slice().sort((x, y) => G.players[p].coins[y] - G.players[p].coins[x])[0];
    payCoin(p, id);
  }
  G.players[p].sunk.shift();
  // The card does not say when it may act; like a captured ship, it acts
  // on your next turn.
  Object.assign(ship, ps, {
    owner: p, placed: true, acted: true, turnsLeft: 0, stage: null, pending: null, braced: false,
    noAction: false, gunner: false, stoneUsed: false, touchPrev: [t.id],
  });
  oneFitting(ship);
  G.players[p].ships.push(ship);
  ev({ e: 'revive', p, ship: ship.id, x: ship.x, y: ship.y, msg: `${ship.name} returns from the deep.` });
};

// ─── Turn end and victory ─────────────────────────────

ACTIONS.declare = p => {
  need(canDeclareVictory(p), 'You need 25 points and at least as many as everyone else, at the start of your turn.');
  const s = scoreBreakdown();
  G.phase = 'over'; G.winner = p;
  G.endReason = `${seatName(p)} declared victory with ${s[p].total} points.`;
};

/** Every ship that did not finish its turns still sails one click per turn left. */
function autoSail(p) {
  for (const s of G.players[p].ships.slice()) {
    let guard = 0;
    while (G.phase === 'play' && !s.acted && G.players[p].ships.includes(s) && guard++ < 8) {
      if (s.pending === 'shot2') { finishFiring(s, s.lastSource || 'ship'); continue; }
      if (isDead(s)) { finishTurn(s); continue; }
      if (!doMove(s, s.h, 1, `${s.name} sails on.`)) break;
      finishTurn(s);
    }
  }
}

ACTIONS.endTurn = p => {
  autoSail(p);
  if (G.phase !== 'play') return;
  endTurnBookkeeping();
  beginTurn();
  if (G.phase === 'play') ev({ e: 'turn', p: G.active, turn: G.turn });
};

/**
 * Nothing left that matters this turn: every ship has finished (so the
 * coin window is shut too) and there is no victory to declare. Scuttling a
 * dead ship is still allowed but never needs the turn held open.
 */
function turnIsOver(p) {
  if (!G || G.phase !== 'play' || G.active !== p) return false;
  const ships = G.players[p].ships;
  return ships.length > 0 && ships.every(s => s.acted && !s.pending) && !canDeclareVictory(p);
}

/** Rough time for a client to play these events (ms), for pacing the server. */
function eventsDuration(events) {
  let t = 0;
  for (const e of events || []) {
    if (e.e === 'move') t += 450 + (e.plan.moved / CLICK_LEN) * 280 + (e.plan.stoppedBy ? 200 : 0);
    else if (e.e === 'shot') t += 500 + e.stopS * 16;
    else if (e.e === 'board' || e.e === 'capture') t += 600;
    else if (e.e === 'flag' || e.e === 'sink') t += 500;
    else if (e.e === 'slide' || e.e === 'revive' || e.e === 'collect') t += 420;
    else if (e.e === 'coin') t += 250;
  }
  return Math.min(8000, t);
}

/** Force the turn over (turn timer, or a seat that left). */
function forceEndTurn() {
  return act(G.active, { t: 'endTurn' });
}
