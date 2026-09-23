// Cannons & Coastlines, digital edition: rules.js
// The rules engine. act(p, action) checks that seat p may do `action` right
// now, applies it to G and returns the events that happened, in order.
// Clients animate the events; the online server runs this same file as the
// authority, so a client can only ever ask, never decide.
//
// Actions (all ids are strings or numbers from the state):
//   { t: 'move', ship, h, clicks, kind }  kind: 'action' | 'au-steer' | 'au-sail'
//   { t: 'fire', ship, source: 'ship'|'island', slot, island, h, D }
//   { t: 'skipShot', ship }            { t: 'pass', ship }
//   { t: 'raise', ship, island }       { t: 'collect', ship, island }
//   { t: 'scuttle', ship }
//   { t: 'coin', coin, target, h, clicks, side }
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
const snapShip = s => ({ id: s.id, owner: s.owner, build: s.build, name: s.name, len: s.len, wid: s.wid, guns: s.guns, hullStyle: s.hullStyle, maxFit: s.maxFit, fit: s.fit, x: s.x, y: s.y, h: s.h });
const hitWords = res => ({ stone: 'stone hull shrugs it off', brace: 'brace absorbs it', fitting: 'a fitting is lost', dead: 'dead in the water', sunk: 'sunk' }[res] || res);

/** Can ship take a fresh action (not a continuation)? */
function freshAction(s) { return !s.acted && !s.pending && !s.mustSail; }

// ─── Moving ───────────────────────────────────────────

function doMove(ship, h, clicks, kind) {
  if (kind !== 'signal') G.coinPhase = false;
  const lockH = kind === 'au-sail' || kind === 'au-auto';
  const plan = planMove(ship, lockH ? ship.h : h, clicks, pivotFor(ship));
  const from = pose(ship);
  ship.x = plan.end.x; ship.y = plan.end.y; ship.h = plan.rot.h;
  ev({ e: 'move', ship: ship.id, from, plan: { rot: { h: plan.rot.h }, start: plan.start, end: plan.end, moved: plan.moved, planned: plan.planned, stoppedBy: plan.stoppedBy, clicks } });
  if (plan.stoppedBy && plan.moved < plan.planned - 0.05) {
    const what = { ship: 'a ship', island: 'an island', terrain: plan.obj ? (plan.obj.type === 'rock' ? 'a rock' : 'a reef') : 'terrain', edge: 'the table edge' }[plan.stoppedBy];
    note(`${ship.name} stops against ${what}.`);
  }
  // Always Underway: a ship with no room at all at the edge is scuttled.
  if (underway() && kind !== 'signal' && plan.stoppedBy === 'edge' && plan.moved < 0.05) {
    ev({ e: 'sink', ship: snapShip(ship), msg: `${ship.name} is forced off the table and scuttled.` });
    sinkShip(ship);
    checkLastFleet();
    return;
  }
  if (kind === 'signal') { ship.signalMoved = true; return; }
  ship.mustSail = false;
  if (ship.fullSail && !ship.movesDone && kind !== 'au-auto') { ship.movesDone = 1; ship.pending = 'move2'; }
  else { ship.acted = true; ship.pending = null; }
}

const ACTIONS = {};

ACTIONS.move = (p, a) => {
  const s = ownShip(p, a.ship);
  need(!isDead(s), 'A dead ship cannot move.');
  const kind = a.kind || (underway() ? 'au-steer' : 'action');
  let clicks = s.moveCount;
  if (!underway()) {
    need(kind === 'action', 'Unknown move.');
    need(s.pending === 'move2' || (freshAction(s) && !s.signalMoved), s.signalMoved ? 'This ship already took its free move. It can still fire.' : 'This ship has already acted.');
  } else {
    clicks = clamp(Math.round(+a.clicks || 1), 1, s.moveCount);
    if (kind === 'au-sail') need(s.mustSail, 'Nothing to sail for.');
    else {
      need(kind === 'au-steer', 'Unknown move.');
      need(s.pending === 'move2' || freshAction(s), 'This ship has already acted.');
    }
  }
  const h = normAngle(+a.h || 0);
  doMove(s, h, clicks, kind);
};

// ─── Firing ───────────────────────────────────────────

function fireOriginFor(ship, F) {
  if (F.source === 'island') return islandGunOrigin(F.island, F.h);
  const w = slotWorld(ship, F.slot);
  return { x: w.x, y: w.y, h: F.slot.free ? F.h : w.h };
}

function finishFiring(ship, source) {
  ship.pending = null; ship.acted = true;
  // Always Underway: a ship that fires from its own slots still has to sail.
  if (underway() && source === 'ship' && !isDead(ship)) ship.mustSail = true;
}

ACTIONS.fire = (p, a) => {
  const s = ownShip(p, a.ship);
  const again = s.pending === 'shot2';
  need(again || freshAction(s), 'This ship has already acted.');
  need(!(underway() && s.fullSail), 'A Full Sail ship does not fire this turn.');
  const F = { source: a.source === 'island' ? 'island' : 'ship', h: normAngle(+a.h || 0) };
  if (F.source === 'island') {
    F.island = islandById(a.island);
    need(F.island.owner === p, 'Only an island you hold has a gun for you.');
    need(shipTouchesTerrain(s, F.island), 'Cannons need a crew: a ship must be touching the island.');
    if (underway() && !again) need(s.anchored, 'Only a ship that started its turn at the island can use its gun.');
  } else {
    F.slot = shipSlots(s)[a.slot | 0];
    need(F.slot, 'No such cannon slot.');
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
      shot.res = res; shot.fitAfter = t.fit;
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
  if (s.gunner && s.shotsDone < 2 && G.phase === 'play' && G.players[p].ships.includes(s)) s.pending = 'shot2';
  else finishFiring(s, F.source);
};

ACTIONS.skipShot = (p, a) => {
  const s = ownShip(p, a.ship);
  need(s.pending === 'shot2', 'No second shot to skip.');
  finishFiring(s, s.lastSource || 'ship');
};

ACTIONS.pass = (p, a) => {
  const s = ownShip(p, a.ship);
  need(freshAction(s), 'This ship has already acted.');
  need(!(underway() && !isDead(s) && !s.anchored), 'Every ship must sail in Always Underway.');
  s.acted = true;
};

// ─── Islands ──────────────────────────────────────────

function islandActionCheck(s, t) {
  need(freshAction(s), 'This ship has already acted.');
  need(shipTouchesTerrain(s, t), 'The ship is not touching that island.');
  if (underway()) need(s.anchored, 'Only a ship that started its turn at the island can do that.');
}

ACTIONS.raise = (p, a) => {
  const s = ownShip(p, a.ship), t = islandById(a.island);
  islandActionCheck(s, t);
  const why = raiseFlagProblem(s, t);
  need(!why, why);
  G.coinPhase = false;
  setFlag(t, p);
  s.acted = true;
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
  s.acted = true;
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

/** Ships that `coinId` could be played on right now by seat p. */
function coinTargets(p, coinId) {
  if (!coinWindowOpen(p) || !G.players[p].coins[coinId]) return [];
  const mine = G.players[p].ships, theirs = enemyShips(p);
  const coins = G.players[p].coins;
  switch (coinId) {
    case 'brace': return mine.filter(s => !s.braced);
    case 'signal': return mine.filter(s => !isDead(s) && !s.acted && !s.signalMoved && !s.fullSail);
    case 'fullsail': return mine.filter(s => !isDead(s) && !s.acted && !s.fullSail && !s.signalMoved);
    case 'evasive': return mine.filter(s => !isDead(s));
    case 'gunner': return mine.filter(s => !s.acted && !s.gunner && !s.fullSail);
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
  target.fit = 1;
  target.acted = true; // may act on the following turn
  target.pending = null; target.signalMoved = false; target.fullSail = false; target.gunner = false; target.mustSail = false;
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
  const target = shipById(a.target);
  need(target && coinTargets(p, id).includes(target), `${COIN_DEFS[id].name} cannot go on that ship.`);
  const at = { e: 'coin', p, coin: id, ship: target.id };
  switch (id) {
    case 'brace':
      payCoin(p, 'brace', true); // stays on the ship until it stops a hit
      target.braced = true;
      ev(Object.assign(at, { msg: `${target.name} braces for impact.` }));
      break;
    case 'fullsail':
      payCoin(p, id); target.fullSail = true;
      ev(Object.assign(at, { msg: `${target.name} will take two moves.` }));
      break;
    case 'gunner':
      payCoin(p, id); target.gunner = true;
      ev(Object.assign(at, { msg: `${target.name} will fire twice.` }));
      break;
    case 'repair':
      if (target.owner !== p) { capture(p, target); break; }
      payCoin(p, id);
      target.fit = Math.min(target.maxFit, target.fit + 1);
      ev(Object.assign(at, { fit: target.fit, msg: `${target.name} repaired (${target.fit}/${target.maxFit}).` }));
      break;
    case 'boarding': {
      if (isDead(target)) { capture(p, target); break; }
      payCoin(p, id);
      const from = boarder(p, target);
      const res = applyHit(target);
      const e = ev({ e: 'board', p, from: from.id, ship: target.id, res, fitAfter: target.fit, msg: `Boarding party on ${target.name}: ${hitWords(res)}.` });
      if (res === 'sunk') e.wreck = snapShip(target);
      if (res === 'fitting' || res === 'dead' || res === 'sunk') { G.stats[p].hits++; plunder(p, from); }
      checkLastFleet();
      break;
    }
    case 'signal': {
      const clicks = underway() ? clamp(Math.round(+a.clicks || 1), 1, target.moveCount) : target.moveCount;
      payCoin(p, id);
      ev(Object.assign(at, { msg: `Signal flags: ${target.name} takes a free move.` }));
      doMove(target, normAngle(+a.h || 0), clicks, 'signal');
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
    owner: p, fit: 1, placed: true, acted: true, pending: null, braced: false, mustSail: false,
    signalMoved: false, fullSail: false, gunner: false, stoneUsed: false, touchPrev: [t.id],
  });
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

/** Always Underway: ships that did nothing still sail one click. */
function underwayAutoSail(p) {
  for (const s of G.players[p].ships.slice()) {
    if (G.phase !== 'play') return;
    const idle = (!s.acted && !isDead(s) && !s.anchored) || s.pending === 'move2' || s.mustSail;
    if (!idle) continue;
    s.pending = null;
    note(`${s.name} sails on.`);
    doMove(s, s.h, 1, 'au-auto');
  }
}

ACTIONS.endTurn = p => {
  if (underway()) underwayAutoSail(p);
  if (G.phase !== 'play') return;
  endTurnBookkeeping();
  beginTurn();
  if (G.phase === 'play') ev({ e: 'turn', p: G.active, turn: G.turn });
};

/** Force the turn over (turn timer, or a seat that left). */
function forceEndTurn() {
  return act(G.active, { t: 'endTurn' });
}
