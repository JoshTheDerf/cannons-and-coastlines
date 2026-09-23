// Cannons & Coastlines, digital edition: main.js
// Screens, input, panels and the action pipeline:
//   perform(action) -> rules engine (local) or game server (online)
//   -> events -> playEvents() animates them -> the display state catches up.

let aiControlled = { 1: false, 2: true };
const setupChoice = {
  solo: true,
  factions: { 1: 'queens_fleet', 2: 'corsairs' },
  setup: 'quick', stalemate: false,
};
const UI = {
  mode: null,      // null | 'move' | 'fire' | 'coin' | 'evasive' | 'revive'
  sel: null, move: null, fire: null, coin: null, evasive: null, targets: null,
  ghost: null, busy: false, dragging: false, placeType: 'rock', msg: '',
};
let loopStarted = false;
const AI_DELAY = 420;

const $ = id => document.getElementById(id);
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
const clone = o => JSON.parse(JSON.stringify(o));

function isOnline() { return typeof NET !== 'undefined' && NET.online; }
function isMyTurn() {
  if (!G) return false;
  if (isOnline()) return NET.seat != null && G.active === NET.seat;
  return !aiControlled[G.active];
}

// ═══ Screens ═══════════════════════════════════════════

const SCREENS = ['titleScreen', 'setupScreen', 'onlineScreen', 'roomScreen', 'game'];
function showScreen(id) {
  for (const s of SCREENS) { const el = $(s); if (el) el.style.display = s === id ? 'flex' : 'none'; }
}

function startSolo() { setupChoice.solo = true; showSetup(); }
function startHotSeat() { setupChoice.solo = false; showSetup(); }

function factionCard(fid, selected, attrs) {
  const f = FACTION_DEFS[fid];
  return `<button class="fCard${selected ? ' selected' : ''}" ${attrs} style="--acc:${rgba(f.hullColor, 1)}">
      <span class="fName">${esc(f.name)}${f.base ? ' <em>base</em>' : ''}</span>
      <span class="fStats">${f.shipCount} ships · ${f.fittings} fitting${f.fittings === 1 ? "" : "s"} · move ${f.moveCount}</span>
      <span class="fPass"><b>${esc(f.passiveName)}.</b> ${esc(f.passiveText)}</span>
    </button>`;
}

function showSetup() {
  showScreen('setupScreen');
  const el = $('setupBody');
  const opt = (key, val, label) => `<button class="optBtn${String(setupChoice[key]) === String(val) ? ' on' : ''}" data-k="${key}" data-v="${val}">${label}</button>`;
  el.innerHTML = [1, 2].map(p => `
      <div class="setupLabel" style="--pc:${PALETTE[p - 1].main}"><span class="dot"></span>${p === 2 && setupChoice.solo ? 'Computer' : 'Player ' + p}</div>
      <div class="fRow">${FACTION_ORDER.map(fid => factionCard(fid, setupChoice.factions[p] === fid, `data-p="${p}" data-f="${fid}"`)).join('')}</div>`).join('') + `
    <div class="optGrid">
      <span>Table</span><div>${opt('setup', 'quick', 'Quick start')}${opt('setup', 'custom', 'Set it up yourselves')}</div>
      <span>Stalemate rule</span><div>${opt('stalemate', true, 'On')}${opt('stalemate', false, 'Off')}</div>
    </div>
    <p class="optNote callout">Rulebook ${RULES_VERSION}: each ship steers, fires, or takes an island action, then sails forward. Only an island action holds a ship still.</p>`;
  el.querySelectorAll('.fCard').forEach(b => b.onclick = () => { setupChoice.factions[b.dataset.p] = b.dataset.f; showSetup(); });
  el.querySelectorAll('.optBtn').forEach(b => b.onclick = () => {
    const v = b.dataset.v;
    setupChoice[b.dataset.k] = v === 'true' ? true : v === 'false' ? false : v;
    showSetup();
  });
}

function beginGame() {
  if (isOnline()) NET.leave();
  aiControlled = { 1: false, 2: setupChoice.solo };
  setRand(Math.random);
  newGame({
    seats: [1, 2].map(p => ({ faction: setupChoice.factions[p], color: p - 1, name: p === 2 && setupChoice.solo ? 'Computer' : `Player ${p}`, ai: p === 2 && setupChoice.solo })),
    setup: setupChoice.setup, stalemate: setupChoice.stalemate, table: 'rect',
  });
  enterGameScreen();
  if (G.phase === 'play') announceTurn();
  kickAI();
}

function enterGameScreen() {
  resetUI();
  showScreen('game');
  $('gameOver').style.display = 'none';
  $('game').classList.toggle('online', isOnline());
  applyLayout();
  if (!loopStarted) {
    loopStarted = true;
    initCanvas();
    bindCanvas();
    new ResizeObserver(() => resizeCanvas()).observe($('boardWrap'));
    window.addEventListener('resize', applyLayout);
    requestAnimationFrame(frame);
  }
  camReset();
  resizeCanvas();
  if (isOnline() && NET.seat != null && G.table.shape === 'circle' && G.table.r > 70) {
    // Big round tables: open zoomed in toward your own fleet.
    const home = seatHome(NET.seat), c = tableCenter();
    camLookAt(c.x + (home.x - c.x) * 0.45, c.y + (home.y - c.y) * 0.45, clamp(G.table.r / 60, 1, 2.2));
  }
  refresh();
}

function resetUI() {
  Object.assign(UI, { mode: null, sel: null, move: null, fire: null, coin: null, evasive: null, targets: null, ghost: null, busy: false, dragging: false, msg: '' });
}

function quitToTitle() {
  if (isOnline()) NET.leave();
  G = null;
  hideMenu();
  $('gameOver').style.display = 'none';
  showScreen('titleScreen');
}

function frame(ts) {
  updateAnimations(ts);
  if (G && $('game').style.display !== 'none') drawFrame();
  if (UI.mode === 'fire' && UI.fire && UI.fire.stage === 'power') {
    const el = document.getElementById('powerFill');
    if (el) el.style.width = (currentPower() * 100).toFixed(1) + '%';
  }
  if (isOnline()) NET.tickTimer();
  requestAnimationFrame(frame);
}

function applyLayout() {
  const g = $('game');
  const land = window.innerWidth > window.innerHeight * 1.15 && window.innerWidth >= 700;
  g.classList.toggle('landscape', land);
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  // Local hot-seat on a phone: flip the far player's panel so it faces them.
  g.classList.toggle('flipTop', !land && coarse && !setupChoice.solo && !isOnline());
  setTimeout(resizeCanvas, 30);
}

function toggleFullscreen() {
  const d = document, el = d.documentElement;
  if (!d.fullscreenElement && !d.webkitFullscreenElement) (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el);
  else (d.exitFullscreen || d.webkitExitFullscreen).call(d);
}

// ═══ Messages ══════════════════════════════════════════

let toastTimer = null;
function logMsg(text) {
  if (!text) return;
  UI.msg = text;
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600 / Math.min(GAME_SPEED, 3));
}

function announceTurn() {
  if (!G || G.phase !== 'play') return;
  const b = $('turnBanner');
  const p = G.active;
  const mine = isOnline() && p === NET.seat;
  b.textContent = mine ? 'Your turn' : `${seatName(p)}: ${FACTION_DEFS[G.factions[p]].name}`;
  b.style.borderLeftColor = colorOf(p).main;
  b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  sfxTurnChange();
}

// ═══ Action pipeline ═══════════════════════════════════

/** Ask for an action. Resolves after its animations have played. */
async function perform(a) {
  if (!G || G.phase !== 'play') return { ok: false, err: 'The game is not running.' };
  UI.busy = true; refresh();
  let res;
  try {
    if (isOnline()) {
      res = await NET.request(a);
    } else {
      const S = G, snap = clone(S);
      res = act(G.active, a);
      if (res.ok) {
        G = snap;
        try { await playEvents(res.events); } finally { G = S; }
      }
    }
  } finally {
    UI.busy = false;
  }
  if (!res.ok) { logMsg(res.err); sfxError(); }
  resyncUI();
  refresh();
  if (res.ok && !isOnline()) afterEvents(res.events);
  return res;
}

/** After a state swap, point the UI at the new objects (by id). */
function resyncUI() {
  if (!G) return;
  if (UI.sel) UI.sel = shipById(UI.sel.id);
  if (UI.move && UI.move.ship) { UI.move.ship = shipById(UI.move.ship.id); if (!UI.move.ship) cancelMode(); else replanMove(); }
  if (UI.fire && UI.fire.ship) { UI.fire.ship = shipById(UI.fire.ship.id); if (!UI.fire.ship) cancelMode(); }
  if (UI.evasive) cancelMode();
  if (UI.targets) UI.targets = UI.targets.map(s => shipById(s.id)).filter(Boolean);
}

function afterEvents(events) {
  if (events.some(e => e.e === 'over') || G.phase === 'over') { setTimeout(showGameOver, 700 / GAME_SPEED); return; }
  if (events.some(e => e.e === 'turn')) { UI.sel = null; cancelMode(); refresh(); announceTurn(); }
  kickAI();
}

function hitDisplay(t, res, fitAfter, wreck) {
  const x = t.x, y = t.y;
  if (res === 'stone') { animText(x, y, 'Stone hull', '220,210,180'); animThud(x, y); return; }
  if (res === 'brace') { t.braced = false; animText(x, y, 'Braced', '241,196,15'); animThud(x, y); return; }
  animHitFlash(x, y);
  if (res === 'fitting' || res === 'dead') {
    t.fit = fitAfter;
    // Which slot along the keel just emptied (Industry: the turret goes last).
    const idx = t.guns === 'industry' ? (t.fit === 0 ? t.maxFit - 1 : t.fit - 1) : t.fit;
    animFittingFall(t, idx, idx % 2 === 0 && !(t.guns === 'industry' && t.fit === 0));
    animText(x, y, res === 'dead' ? 'Dead in the water' : '-1 fitting');
    sfxMastFall();
  }
  if (res === 'sunk') {
    animWreck(wreck || t);
    animText(x, y, 'Sunk!');
    removeFromDisplay(t.id);
  }
}

function removeFromDisplay(id) {
  for (const p of G.order) {
    const list = G.players[p].ships, i = list.findIndex(s => s.id === id);
    if (i >= 0) list.splice(i, 1);
  }
}

/** Animate events on the display state, updating it as they play. */
async function playEvents(events) {
  for (const e of events) {
    const s = e.ship && typeof e.ship === 'string' ? shipById(e.ship) : null;
    switch (e.e) {
      case 'msg': logMsg(e.msg); break;
      case 'move':
        if (s) { Object.assign(s, e.from); await animShipMove(s, e.plan); s.h = e.plan.rot.h; }
        break;
      case 'slide':
        logMsg(e.msg); sfxCoinPlay(); sfxRudder();
        if (s) await animSlide(s, e.from, e.to);
        break;
      case 'shot': {
        sfxFire(); hapticThud();
        animSmoke(e.origin.x, e.origin.y, e.h);
        await animCannonball(e.origin.x, e.origin.y, e.h, e.D, e.stopS, e.b);
        if (e.kind === 'ship') {
          animRicochet(e.x, e.y, e.h);
          const t = shipById(e.target);
          if (e.friendly) { animThud(e.x, e.y); if (t) animText(t.x, t.y, 'No friendly fire', '200,200,200'); }
          else if (t) hitDisplay(t, e.res, e.fitAfter, e.wreck);
        } else if (e.kind === 'terrain') { animThud(e.x, e.y); animRicochet(e.x, e.y, e.h); }
        else if (e.kind === 'none') animSplash(e.x, e.y);
        logMsg(e.msg);
        await sleep(260);
        break;
      }
      case 'board': {
        const from = shipById(e.from);
        logMsg(e.msg);
        if (from && s) animBoarding(from.x, from.y, s.x, s.y);
        await sleep(550);
        if (s) hitDisplay(s, e.res, e.fitAfter, e.wreck);
        break;
      }
      case 'capture': {
        const from = shipById(e.from);
        logMsg(e.msg);
        if (from && s) animBoarding(from.x, from.y, s.x, s.y);
        await sleep(550);
        if (s) { animFlagRaise(s.x, s.y, colorOf(e.p).rgb.join(',')); animSparkle(s.x, s.y); }
        break;
      }
      case 'flag': {
        const t = G.terrain[e.island];
        if (t) { t.owner = e.p; animFlagRaise(t.x, t.y, colorOf(e.p).rgb.join(',')); }
        logMsg(e.msg);
        await sleep(500);
        break;
      }
      case 'collect': {
        const t = G.terrain[e.island];
        if (t) animSparkle(t.x, t.y);
        sfxCoinPlay(); logMsg(e.msg);
        await sleep(350);
        break;
      }
      case 'plunder': animText(e.x, e.y - 4, 'Plunder +1', '255,215,90'); break;
      case 'coin':
        sfxCoinPlay(); logMsg(e.msg);
        if (s) {
          const col = { brace: '241,196,15', gunner: '255,140,90', signal: '120,220,255' }[e.coin];
          if (e.coin === 'signal') { const g = shipById(e.from); if (g) animRing(g.x, g.y, '200,200,200'); }
          if (e.coin === 'repair') { s.fit = e.fit; animSparkle(s.x, s.y); animText(s.x, s.y, '+1 fitting', '120,240,160'); }
          else animRing(s.x, s.y, col);
          if (e.coin === 'brace') s.braced = true;
        }
        await sleep(250);
        break;
      case 'sink':
        logMsg(e.msg);
        animWreck(e.ship);
        removeFromDisplay(e.ship.id);
        await sleep(500);
        break;
      case 'revive':
        animSparkle(e.x, e.y); animRing(e.x, e.y, '180,140,255'); sfxCoinPlay(); logMsg(e.msg);
        await sleep(400);
        break;
    }
  }
}

// ═══ Player input ══════════════════════════════════════

const ptrs = new Map();
let pinch = null, pan = null;

function bindCanvas() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    camZoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  window.addEventListener('keydown', onKey);
}

function eventWorld(e) {
  const r = canvas.getBoundingClientRect();
  return s2w(e.clientX - r.left, e.clientY - r.top);
}
function eventScreen(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

function canInteract() { return G && !UI.busy && isMyTurn() && !isAnimating(); }

function onPointerDown(e) {
  ensureAudio();
  ptrs.set(e.pointerId, eventScreen(e));
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (ptrs.size === 2) {
    const [a, b] = [...ptrs.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    pan = null; UI.dragging = false;
    return;
  }
  if (ptrs.size > 2 || !G) return;
  if (e.button === 1 || e.button === 2) { pan = { x: e.clientX, y: e.clientY, moved: true }; return; }
  if (isAnimating() || (G.phase === 'play' && !isMyTurn())) {
    if (isAnimating()) skipAnimations();
    pan = { x: e.clientX, y: e.clientY, moved: false, tap: null };
    return;
  }
  if (!canInteract()) return;
  const w = eventWorld(e);
  if (G.phase === 'islands') { setupPlace(w, 'island'); return; }
  if (G.phase === 'terrain') { setupPlace(w, UI.placeType); return; }
  if (G.phase === 'deploy') { deployTap(w); return; }
  if (G.phase !== 'play') return;
  switch (UI.mode) {
    case 'move': UI.dragging = true; setMoveHeading(w); return;
    case 'fire': firePointer(w, true); return;
    case 'coin': coinTap(w); return;
    case 'signalTo': signalToTap(w); return;
    case 'evasive': {
      const ev = UI.evasive;
      const dp = dist(w.x, w.y, ev.port.end.x, ev.port.end.y), ds = dist(w.x, w.y, ev.stbd.end.x, ev.stbd.end.y);
      if (Math.min(dp, ds) < 6) chooseEvasive(dp < ds ? 'port' : 'stbd');
      return;
    }
    case 'revive': reviveTap(w); return;
  }
  const s = pickShip(w, G.active);
  if (s) { selectShip(s); return; }
  // Empty water: drag to pan the view, tap to deselect.
  pan = { x: e.clientX, y: e.clientY, moved: false, tap: w };
}

function onPointerMove(e) {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, eventScreen(e));
  if (pinch && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    if (pinch.d > 0) camZoomAt(mx, my, d / pinch.d);
    camPan(mx - pinch.mx, my - pinch.my);
    pinch = { d, mx, my };
    return;
  }
  if (pan) {
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (pan.moved || Math.hypot(dx, dy) > 6) { pan.moved = true; camPan(dx, dy); pan.x = e.clientX; pan.y = e.clientY; }
    return;
  }
  if (!G || !isMyTurn()) return;
  const w = eventWorld(e);
  const mouse = e.pointerType === 'mouse';
  if (G.phase === 'islands' || G.phase === 'terrain') {
    const type = G.phase === 'islands' ? 'island' : UI.placeType;
    const r = nextRadius(type);
    const prob = type === 'island' ? islandSpotProblem(w.x, w.y, r) : terrainSpotProblem(w.x, w.y, r);
    UI.ghost = { type, x: w.x, y: w.y, r, ok: !prob, prob };
    return;
  }
  if (G.phase === 'deploy') { deployGhost(w); return; }
  if (UI.mode === 'move' && (UI.dragging || mouse)) setMoveHeading(w);
  if (UI.mode === 'fire' && UI.fire && UI.fire.stage === 'dir' && (UI.dragging || mouse)) firePointer(w, false);
}

function onPointerUp(e) {
  ptrs.delete(e.pointerId);
  if (ptrs.size < 2) pinch = null;
  UI.dragging = false;
  if (pan && ptrs.size === 0) {
    if (!pan.moved && pan.tap && canInteract()) {
      const enemy = G.order.filter(q => q !== G.active).map(q => pickShip(pan.tap, q)).find(Boolean);
      if (enemy) logMsg(`${enemy.name} (${seatName(enemy.owner)}): ${enemy.fit}/${enemy.maxFit} fittings${isDead(enemy) ? ', dead in the water' : ''}${enemy.braced ? ', braced' : ''}.`);
      UI.sel = null; refresh();
    }
    pan = null;
  }
}

function onKey(e) {
  if (!G) return;
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
  if (e.key === '+' || e.key === '=') camZoomAt(canvasW / 2, canvasH / 2, 1.25);
  if (e.key === '-') camZoomAt(canvasW / 2, canvasH / 2, 0.8);
  if (!canInteract()) return;
  if (e.key === 'Escape') { cancelMode(); refresh(); }
  if (UI.mode === 'move' && !UI.move.lockHeading && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    UI.move.h = normAngle(UI.move.h + (e.key === 'ArrowLeft' ? -1 : 1) * Math.PI / 36);
    replanMove(); refreshPrompt(); e.preventDefault();
  }
  if (UI.mode === 'move' && e.key === 'Enter') commitMove();
  if (UI.mode === 'fire' && UI.fire.stage === 'power' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); releaseShot(); }
}

function pickShip(w, p) {
  let best = null, bd = Infinity;
  const tol = Math.max(2.5, 16 / worldScale);
  for (const s of G.players[p].ships) {
    const sg = shipSeg(s);
    const d = ptSegDist(w.x, w.y, sg.ax, sg.ay, sg.bx, sg.by) - sg.r;
    if (d < tol && d < bd) { bd = d; best = s; }
  }
  return best;
}

function cancelMode() {
  UI.signalFrom = null;
  UI.mode = null; UI.move = null; UI.fire = null; UI.coin = null; UI.evasive = null; UI.targets = null;
}

function selectShip(s) {
  cancelMode();
  UI.sel = s;
  sfxSelect(); hapticTap();
  if (s.pending === 'shot2') { startFire(s, s.lastSource || 'ship', s.lastIsland != null ? G.terrain[s.lastIsland] : null); return; }
  if (s.stage === 'click' && !s.acted) { startMove(s, 'sail'); return; }
  refresh();
}

// ─── Setup phases (local games only) ──────────────────

const nextR = {};
function nextRadius(type) {
  if (!nextR[type]) nextR[type] = type === 'island' ? islandRadius() : terrainRadius(type);
  return nextR[type];
}

function setupPlace(w, type) {
  const r = nextRadius(type);
  const prob = type === 'island' ? islandSpotProblem(w.x, w.y, r) : terrainSpotProblem(w.x, w.y, r);
  if (prob) { logMsg(prob); sfxError(); return; }
  placeSetupPiece(type, w.x, w.y, r);
}

function placeSetupPiece(type, x, y, r) {
  addTerrain(type, x, y, r);
  sfxSelect(); hapticTap();
  UI.ghost = null; delete nextR[type];
  if (G.phase === 'islands') {
    // Players take turns placing one island each.
    if (islands().length >= G.islandCount) { G.phase = 'terrain'; G.active = 1; }
    else G.active = nextSeat(G.active);
  } else {
    G.terrainPlaced[G.active]++;
    if (G.terrainPlaced[G.active] >= 3) terrainDone();
  }
  refresh(); kickAI();
}

function randomSetupPiece() {
  const type = G.phase === 'islands' ? 'island' : UI.placeType;
  for (let a = 0; a < 400; a++) {
    const r = type === 'island' ? islandRadius() : terrainRadius(type);
    const x = r + Math.random() * (G.table.w - 2 * r), y = r + Math.random() * (G.table.h - 2 * r);
    const bad = type === 'island' ? islandSpotProblem(x, y, r) : (terrainSpotProblem(x, y, r) || islandSpotProblemForTerrain(x, y, r));
    if (!bad) { placeSetupPiece(type, x, y, r); return true; }
  }
  // No room left for the rulebook spacing: stop placing.
  if (G.phase === 'islands') { G.phase = 'terrain'; G.active = 1; refresh(); kickAI(); }
  return false;
}

function terrainDone() {
  // Each player may add up to three rocks or reefs (the rulebook says 2 to 6 in total).
  G.terrainPlaced[G.active] = Math.max(G.terrainPlaced[G.active], 3);
  const next = G.order.find(q => G.terrainPlaced[q] < 3);
  if (next) G.active = next;
  else { G.phase = 'deploy'; G.active = 1; }
  UI.ghost = null;
  refresh(); kickAI();
}

function nextUnplaced(p) { return G.players[p].ships.find(s => !s.placed); }

function deployGhost(w) {
  const ship = nextUnplaced(G.active);
  if (!ship) { UI.ghost = null; return null; }
  const ps = deployPose(G.active, ship, w.x);
  UI.ghost = { ship, pose: ps, ok: canDeployAt(ship, ps) };
  return UI.ghost;
}

function deployTap(w) {
  const gh = deployGhost(w);
  if (!gh) return;
  if (!gh.ok) { logMsg('No room there.'); sfxError(); return; }
  Object.assign(gh.ship, gh.pose); gh.ship.placed = true;
  sfxSelect(); hapticTap();
  UI.ghost = null;
  refresh();
}

function deployAuto() { autoDeploy(G.active); UI.ghost = null; refresh(); }
function deployUndo() {
  const placed = G.players[G.active].ships.filter(s => s.placed);
  if (placed.length) placed[placed.length - 1].placed = false;
  refresh();
}
function deployConfirm() {
  if (nextUnplaced(G.active)) return;
  const next = G.order.find(q => G.players[q].ships.some(s => !s.placed));
  if (next) G.active = next;
  else {
    applyHomeWaters();
    G.phase = 'play'; G.active = 1; G.turn = 1;
    beginTurn();
    announceTurn();
  }
  UI.ghost = null;
  refresh(); kickAI();
}

// ─── Move ─────────────────────────────────────────────

/** kind 'steer' (Set Heading, then click) or 'sail' (heading held). */
function startMove(ship, kind) {
  cancelMode();
  UI.sel = ship;
  UI.mode = 'move';
  UI.move = { ship, kind, h: ship.h, clicks: ship.moveCount, lockHeading: kind === 'sail', plan: null };
  replanMove();
  refresh();
}

function replanMove() {
  const m = UI.move;
  m.plan = planMove(m.ship, m.lockHeading ? m.ship.h : m.h, m.clicks, pivotFor(m.ship));
}

function setMoveHeading(w) {
  const m = UI.move;
  if (!m || m.lockHeading) return;
  if (dist(w.x, w.y, m.ship.x, m.ship.y) < 1) return;
  m.h = headingTo(w.x - m.ship.x, w.y - m.ship.y);
  replanMove();
  refreshPrompt();
}

function changeClicks(d) {
  const m = UI.move;
  m.clicks = clamp(m.clicks + d, 1, m.ship.moveCount);
  replanMove(); refresh();
}

async function commitMove() {
  const m = UI.move;
  if (!m || UI.busy) return;
  const { ship, clicks } = m;
  const id = ship.id;
  const hh = m.lockHeading ? ship.h : m.plan.rot.h;
  cancelMode();
  const res = await perform({ t: 'move', ship: id, h: hh, clicks });
  if (!res.ok || !G || G.phase !== 'play') return;
  const s = shipById(id);
  if (s && !s.acted && s.turnsLeft > 0 && G.active === s.owner) { logMsg(`${s.name}: next turn.`); UI.sel = s; refresh(); return; }
  UI.sel = null; refresh();
}

// ─── Fire ─────────────────────────────────────────────

function startFire(ship, source, island) {
  cancelMode();
  UI.sel = ship;
  UI.mode = 'fire';
  const slots = source === 'ship' ? shipSlots(ship) : [];
  UI.fire = { ship, source, island, slots, slot: null, slotIdx: -1, h: ship.h, stage: source === 'ship' ? 'slot' : 'dir', t0: 0 };
  if (source === 'island') UI.fire.h = headingTo(island.x - ship.x, island.y - ship.y);
  if (source === 'ship' && slots.length === 1) chooseSlot(0);
  refresh();
}

function chooseSlot(idx) {
  const F = UI.fire;
  F.slot = F.slots[idx]; F.slotIdx = idx;
  if (F.slot.free) { F.stage = 'dir'; F.h = F.ship.h; }
  else startPower();
  sfxSelect();
  refresh();
}

function startPower() {
  const F = UI.fire;
  F.stage = 'power';
  F.t0 = performance.now();
}

function currentPower() {
  const F = UI.fire;
  if (!F) return 0;
  if (F.fixed != null) return F.fixed;
  const u = (((performance.now() - F.t0) / 1000) / POWER_PERIOD) % 1;
  return u < 0.5 ? u * 2 : 2 - u * 2;
}

function fireOrigin(F) { return fireOriginFor(F.ship, F); }

function firePointer(w, isDown) {
  const F = UI.fire;
  if (F.stage === 'slot') {
    let best = -1, bd = Infinity;
    F.slots.forEach((sl, i) => {
      const p = slotWorld(F.ship, sl);
      const d = dist(w.x, w.y, p.x, p.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0 && bd < Math.max(2.5, 20 / worldScale)) chooseSlot(best);
    return;
  }
  if (F.stage === 'dir') {
    const o = F.source === 'island' ? F.island : slotWorld(F.ship, F.slot);
    if (dist(w.x, w.y, o.x, o.y) > 0.8) F.h = headingTo(w.x - o.x, w.y - o.y);
    if (isDown) UI.dragging = true;
    return;
  }
  if (F.stage === 'power' && isDown) releaseShot();
}

function lockAim() { if (UI.fire && UI.fire.stage === 'dir') { startPower(); refresh(); } }

async function releaseShot() {
  const F = UI.fire;
  if (!F || F.stage !== 'power' || UI.busy) return;
  const D = powerToRange(currentPower());
  const id = F.ship.id;
  const a = { t: 'fire', ship: id, source: F.source, slot: F.slotIdx, island: F.island ? F.island.id : null, h: F.h, D };
  cancelMode();
  const res = await perform(a);
  if (!res.ok || !G || G.phase !== 'play') return;
  const s = shipById(id);
  if (s && s.pending === 'shot2') {
    logMsg('Skilled Gunner: fire the second shot.');
    startFire(s, a.source, a.island != null ? G.terrain[a.island] : null);
    return;
  }
  if (s && s.stage === 'click' && !s.acted) { startMove(s, 'sail'); return; }
  if (s && !s.acted && s.turnsLeft > 0) { logMsg(`${s.name}: next turn.`); UI.sel = s; refresh(); return; }
  UI.sel = null; refresh();
}

async function skipSecond() {
  const s = UI.sel;
  if (!s) return;
  const id = s.id;
  cancelMode();
  const res = await perform({ t: 'skipShot', ship: id });
  const again = res.ok && shipById(id);
  if (again && again.stage === 'click' && !again.acted) { startMove(again, 'sail'); return; }
  UI.sel = null; refresh();
}

// ─── Ship actions menu ────────────────────────────────

function shipActions(ship) {
  const acts = [];
  if (ship.owner !== G.active || G.phase !== 'play') return acts;
  const dead = isDead(ship);
  if (!ship.acted && !ship.pending) {
    if (ship.stage === 'click') acts.push({ id: 'sail', label: 'Sail on' });
    else if (ship.noAction) acts.push({ id: 'sail', label: 'Sail on (no action)' });
    else {
      const x2 = ship.turnsLeft > 1 ? ` (turn 1 of ${ship.turnsLeft})` : '';
      if (!dead) acts.push({ id: 'steer', label: 'Steer and sail' + x2 });
      acts.push({ id: 'fire', label: (ship.gunner ? 'Fire twice' : 'Fire') + (dead ? '' : ', then sail') });
      for (const t of touchingIslands(ship).map(i => G.terrain[i])) {
        if (t.owner === ship.owner) {
          acts.push({ id: 'collect', t, label: passiveOf(ship.owner) === 'harvest' ? 'Collect 2' : 'Collect' });
          acts.push({ id: 'islandgun', t, label: 'Island gun' });
        } else {
          const why = raiseFlagProblem(ship, t);
          acts.push({ id: 'raise', t, label: 'Raise flag', disabled: !!why, why });
        }
      }
      if (dead) acts.push({ id: 'pass', label: 'Done' });
    }
  }
  if (dead) acts.push({ id: 'scuttle', label: 'Scuttle' });
  return acts;
}

async function doShipAction(act) {
  const ship = UI.sel;
  if (!ship || !canInteract()) return;
  switch (act.id) {
    case 'steer': startMove(ship, 'steer'); return;
    case 'sail': startMove(ship, 'sail'); return;
    case 'fire': startFire(ship, 'ship'); return;
    case 'islandgun': startFire(ship, 'island', act.t); return;
  }
  if (act.disabled) { logMsg(act.why); sfxError(); return; }
  cancelMode();
  const a = { t: act.id, ship: ship.id };
  if (act.t) a.island = act.t.id;
  const res = await perform(a);
  const s = res.ok && shipById(ship.id);
  if (s && !s.acted && s.turnsLeft > 0 && G.active === s.owner) { UI.sel = s; refresh(); return; }
  UI.sel = null; refresh();
}

// ─── Coins ────────────────────────────────────────────

function onCoinTap(p, id) {
  ensureAudio();
  if (!canInteract() || p !== G.active) return;
  if (!coinWindowOpen(p)) { logMsg('Coins are spent at the start of the turn, before any ship acts.'); sfxError(); return; }
  if (G.players[p].coins[id] <= 0) return;
  if (UI.mode === 'coin' && UI.coin === id) { cancelMode(); refresh(); return; }
  const targets = coinTargets(p, id);
  cancelMode();
  if (!targets.length) { logMsg(`${COIN_DEFS[id].name}: no ship can use it right now.`); sfxError(); refresh(); return; }
  UI.mode = 'coin'; UI.coin = id; UI.targets = targets; UI.sel = null;
  hapticTap();
  refresh();
}

function nearestTarget(w) {
  let target = null, bd = Infinity;
  for (const s of UI.targets || []) {
    const sg = shipSeg(s);
    const d = ptSegDist(w.x, w.y, sg.ax, sg.ay, sg.bx, sg.by) - sg.r;
    if (d < bd) { bd = d; target = s; }
  }
  return target && bd <= Math.max(3, 18 / worldScale) ? target : null;
}

async function signalToTap(w) {
  const to = nearestTarget(w), from = UI.signalFrom;
  if (!to || !from) return;
  cancelMode();
  await perform({ t: 'coin', coin: 'signal', from: from.id, target: to.id });
  UI.sel = null; refresh();
}

async function coinTap(w) {
  const id = UI.coin;
  let target = null, bd = Infinity;
  for (const s of UI.targets) {
    const sg = shipSeg(s);
    const d = ptSegDist(w.x, w.y, sg.ax, sg.ay, sg.bx, sg.by) - sg.r;
    if (d < bd) { bd = d; target = s; }
  }
  if (!target || bd > Math.max(3, 18 / worldScale)) return;
  await playCoin(id, target);
}

async function playCoin(id, target) {
  cancelMode();
  if (id === 'signal') {
    // Two taps: the ship that gives up its action, then the one that gets two turns.
    UI.mode = 'signalTo'; UI.coin = 'signal'; UI.signalFrom = target;
    UI.targets = signalReceivers(G.active, target); UI.sel = target;
    refresh();
    return;
  }
  if (id === 'evasive') {
    UI.sel = target;
    UI.mode = 'evasive';
    UI.evasive = Object.assign({ ship: target }, evasivePlans(target));
    refresh();
    return;
  }
  await perform({ t: 'coin', coin: id, target: target.id });
}

async function chooseEvasive(side) {
  const ev = UI.evasive;
  if (!ev) return;
  cancelMode();
  await perform({ t: 'coin', coin: 'evasive', target: ev.ship.id, side });
  UI.sel = null; refresh();
}

function startRevive() {
  if (!reviveAllowed(G.active)) return;
  cancelMode();
  UI.mode = 'revive';
  refresh();
}

async function reviveTap(w) {
  const p = G.active;
  const t = islands().find(t => t.owner === p && dist(w.x, w.y, t.x, t.y) < t.r + 4);
  if (!t) { logMsg('Tap one of your islands.'); return; }
  cancelMode();
  await perform({ t: 'revive', island: t.id });
}

async function endTurn() { cancelMode(); UI.sel = null; await perform({ t: 'endTurn' }); }
async function declareVictory() { await perform({ t: 'declare' }); }

// ═══ Panels ════════════════════════════════════════════

function refresh() {
  if (!G || $('game').style.display === 'none') return;
  if (isOnline()) {
    if (NET.seat != null) buildPanel(NET.seat, $('panel1'));
    else buildSpectatorPanel($('panel1'));
    buildScoreboard($('panel2'));
  } else {
    $('panel2').classList.remove('scoreboard');
    buildPanel(1, $('panel1')); buildPanel(2, $('panel2'));
  }
}

function btn(label, fn, opts = {}) {
  const b = document.createElement('button');
  b.className = 'actBtn' + (opts.cls ? ' ' + opts.cls : '');
  b.textContent = label;
  if (opts.act) b.dataset.act = opts.act;
  if (opts.disabled) b.classList.add('dim');
  if (opts.title) b.title = opts.title;
  b.addEventListener('click', e => { e.stopPropagation(); ensureAudio(); fn(); });
  return b;
}

function menuButton(el) {
  const mb = document.createElement('button');
  mb.className = 'menuBtn'; mb.textContent = '☰'; mb.title = 'Menu';
  mb.addEventListener('click', e => { e.stopPropagation(); showMenu(); });
  el.querySelector('.pHead').appendChild(mb);
}

function coinTrayInto(tray, p, active) {
  const open = active && coinWindowOpen(p) && isMyTurn();
  for (const id of COIN_ORDER) {
    const n = G.players[p].coins[id];
    const b = document.createElement('button');
    b.className = 'coin' + (n ? '' : ' none') + (open && n ? ' live' : '') + (UI.mode === 'coin' && UI.coin === id && active ? ' sel' : '');
    b.dataset.coin = id;
    b.title = `${COIN_DEFS[id].name}: ${COIN_DEFS[id].text}`;
    b.innerHTML = `<img src="${COIN_DEFS[id].img}" alt=""><span class="cn">${COIN_DEFS[id].short}</span>${n ? `<span class="cc">${n}</span>` : ''}`;
    b.addEventListener('click', e => { e.stopPropagation(); onCoinTap(p, id); });
    tray.appendChild(b);
  }
}

function buildPanel(p, el) {
  const f = FACTION_DEFS[G.factions[p]];
  const active = G.active === p && G.phase !== 'over';
  el.classList.toggle('active', active);
  el.classList.remove('scoreboard');
  el.style.setProperty('--pc', colorOf(p).main);
  el.style.setProperty('--pcd', colorOf(p).dark);
  const sc = G.phase === 'play' || G.phase === 'over' ? scoreBreakdown()[p] : null;
  const who = isOnline() ? `${seatName(p)} (you)` : aiControlled[p] ? (setupChoice.solo && p === 2 ? 'Computer' : `P${p} (AI)`) : `Player ${p}`;
  el.innerHTML = `
    <div class="pHead">
      <span class="pDot"></span><span class="pWho">${esc(who)}</span>
      <span class="pFaction">${esc(f.name)}</span>
      ${sc ? `<span class="pScore" title="Ships ${sc.ships} x3, islands ${sc.islands} x2, coins ${sc.coins}, bonus ${sc.bonus}">${sc.total} pts</span>
      <span class="pMeta">${sc.ships} ships · ${sc.islands} isl · ${sc.coins} coins</span>` : ''}
      ${isOnline() ? '<span class="pTimer" id="turnTimer"></span>' : ''}
    </div>
    <div class="coinTray"></div>
    <div class="pBar"><div class="prompt"></div><div class="acts"></div></div>`;
  if (p === 1 || !setupChoice.solo || isOnline()) menuButton(el);
  if (G.phase === 'play' || G.phase === 'over') coinTrayInto(el.querySelector('.coinTray'), p, active);
  const prompt = el.querySelector('.prompt'), acts = el.querySelector('.acts');
  if (active) fillBar(p, prompt, acts);
  else if (G.phase === 'play') prompt.textContent = isOnline() ? `Waiting for ${seatName(G.active)}.` : 'Waiting.';
  else if (G.phase !== 'over') prompt.textContent = 'Waiting.';
  if (!G.players[p].ships.length && G.phase === 'play') prompt.textContent = 'Your fleet is gone. You can keep watching.';
}

function buildSpectatorPanel(el) {
  el.classList.remove('active', 'scoreboard');
  el.style.setProperty('--pc', '#6b4c30'); el.style.setProperty('--pcd', '#3c2415');
  el.innerHTML = `<div class="pHead"><span class="pWho">Watching</span><span class="pFaction">${esc(NET.room ? NET.room.name : '')}</span><span class="pTimer" id="turnTimer"></span></div>
    <div class="pBar"><div class="prompt">${G.phase === 'play' ? `${esc(seatName(G.active))} is playing.` : ''}</div></div>`;
  menuButton(el);
}

function buildScoreboard(el) {
  el.classList.add('scoreboard'); el.classList.remove('active');
  el.style.setProperty('--pc', colorOf(G.active).main);
  const sc = scoreBreakdown();
  el.innerHTML = `<div class="sbRows">${G.order.map(p => {
    const pl = G.players[p], out = !pl.ships.length;
    const away = NET.away && NET.away.includes(p);
    return `<div class="sbRow${p === G.active && G.phase === 'play' ? ' on' : ''}${out ? ' out' : ''}" style="--pc:${colorOf(p).main};--pcd:${colorOf(p).dark}">
      <span class="pDot"></span><span class="sbName">${esc(pl.name)}${p === NET.seat ? ' (you)' : ''}${pl.ai ? ' (AI)' : ''}${away ? ' (away)' : ''}</span>
      <span class="sbFac">${esc(FACTION_DEFS[G.factions[p]].name)}</span>
      <span class="sbPts">${sc[p].total} pts</span>
      <span class="sbMeta">${sc[p].ships} ships · ${sc[p].islands} isl · ${sc[p].coins} coins</span></div>`;
  }).join('')}</div>`;
}

function refreshPrompt() {
  const el = $('panel1').querySelector('.prompt');
  if (el && UI.mode === 'move') el.textContent = movePrompt();
}

function movePrompt() {
  const m = UI.move;
  const pl = m.plan;
  const n = pl ? Math.round(pl.moved / CLICK_LEN * 10) / 10 : 0;
  const head = m.lockHeading ? 'Heading held.' : `Drag the handle or tap the water to set heading (up to ${pivotFor(m.ship)}\u00B0).`;
  const stop = pl && pl.stoppedBy && pl.moved < pl.planned - 0.05 ? ` Stops after ${n} of ${m.clicks}.` : '';
  const off = pl && pl.stoppedBy === 'edge' && pl.moved < 0.05 ? ' No room: the ship would be scuttled!' : '';
  return `${head} Sail ${m.clicks} click${m.clicks > 1 ? 's' : ''} forward.${stop}${off}`;
}

function fillBar(p, prompt, acts) {
  const say = t => { prompt.textContent = t; };
  if (!isMyTurn()) { say(isOnline() ? `Waiting for ${seatName(G.active)}.` : 'Thinking...'); return; }
  if (UI.busy) { say(UI.msg || '...'); return; }
  switch (G.phase) {
    case 'islands':
      say(`Place an island (${G.islandCount - islands().length} left). Tap inside the dotted line.`);
      acts.appendChild(btn('Random spot', randomSetupPiece, { act: 'random' }));
      return;
    case 'terrain':
      say(`Rocks and reefs block ships and shots. Place up to ${3 - G.terrainPlaced[p]} more, or finish.`);
      acts.appendChild(btn('Rock', () => { UI.placeType = 'rock'; UI.ghost = null; refresh(); }, { cls: UI.placeType === 'rock' ? 'on' : '', act: 'rock' }));
      acts.appendChild(btn('Reef', () => { UI.placeType = 'reef'; UI.ghost = null; refresh(); }, { cls: UI.placeType === 'reef' ? 'on' : '', act: 'reef' }));
      acts.appendChild(btn('Random', randomSetupPiece, { act: 'random' }));
      acts.appendChild(btn('Done', terrainDone, { cls: 'go', act: 'done' }));
      return;
    case 'deploy': {
      const next = nextUnplaced(p);
      say(next ? `Tap your edge to line up ${next.name}. Ships start touching the edge, facing in.` : 'Fleet in line.');
      if (next) acts.appendChild(btn('Line up all', deployAuto, { act: 'autodeploy' }));
      if (G.players[p].ships.some(s => s.placed)) acts.appendChild(btn('Undo', deployUndo, { act: 'undo' }));
      if (!next) acts.appendChild(btn('Ready', deployConfirm, { cls: 'go', act: 'ready' }));
      return;
    }
    case 'play': break;
    default: return;
  }

  if (UI.mode === 'move') {
    say(movePrompt());
    const m = UI.move;
    acts.appendChild(btn('\u2212', () => changeClicks(-1), { act: 'less', disabled: m.clicks <= 1 }));
    acts.appendChild(btn('+', () => changeClicks(1), { act: 'more', disabled: m.clicks >= m.ship.moveCount }));
    acts.appendChild(btn('Sail', commitMove, { cls: 'go', act: 'sail' }));
    if (m.ship.stage !== 'click') acts.appendChild(btn('Cancel', () => { cancelMode(); refresh(); }, { act: 'cancel' }));
    return;
  }
  if (UI.mode === 'fire') {
    const F = UI.fire;
    if (F.stage === 'slot') say(`Tap a cannon slot on ${F.ship.name}. Shots go straight out from the slot.`);
    else if (F.stage === 'dir') say(F.source === 'island' ? 'Tap to aim the island gun.' : 'Tap to aim the turret.');
    else say('Tap to fire when the ring is where you want the ball to land.');
    if (F.stage === 'dir') acts.appendChild(btn('Aim here', lockAim, { cls: 'go', act: 'aim' }));
    if (F.stage === 'power') {
      const m = document.createElement('div');
      m.className = 'meter'; m.innerHTML = '<span>Tension</span><div class="bar"><i id="powerFill"></i></div>';
      acts.appendChild(m);
      acts.appendChild(btn('Fire!', releaseShot, { cls: 'go fireBtn', act: 'fire' }));
    }
    if (F.ship.pending === 'shot2') acts.appendChild(btn('Skip shot', skipSecond, { act: 'skip' }));
    else acts.appendChild(btn('Cancel', () => { cancelMode(); refresh(); }, { act: 'cancel' }));
    return;
  }
  if (UI.mode === 'coin') {
    const c = COIN_DEFS[UI.coin];
    const where = UI.coin === 'boarding' ? 'Tap an enemy ship touching yours.' : UI.coin === 'repair' ? 'Tap one of your ships (or a dead enemy to capture it).' : UI.coin === 'signal' ? 'First tap the ship that gives up its action.' : 'Tap one of your ships.';
    say(`${c.name}: ${c.text} ${where}`);
    acts.appendChild(btn('Cancel', () => { cancelMode(); refresh(); }, { act: 'cancel' }));
    return;
  }
  if (UI.mode === 'signalTo') {
    say(`Signal Flags: ${UI.signalFrom.name} gives up its action and only sails. Tap the ship that takes two turns.`);
    acts.appendChild(btn('Cancel', () => { cancelMode(); refresh(); }, { act: 'cancel' }));
    return;
  }
  if (UI.mode === 'evasive') {
    say(`Evasive: slide ${UI.evasive.ship.name} one ship-width.`);
    acts.appendChild(btn('Port', () => chooseEvasive('port'), { act: 'port' }));
    acts.appendChild(btn('Starboard', () => chooseEvasive('stbd'), { act: 'stbd' }));
    acts.appendChild(btn('Cancel', () => { cancelMode(); refresh(); }, { act: 'cancel' }));
    return;
  }
  if (UI.mode === 'revive') {
    say('Return from the Deep: tap one of your islands.');
    acts.appendChild(btn('Cancel', () => { cancelMode(); refresh(); }, { act: 'cancel' }));
    return;
  }

  const s = UI.sel;
  if (s && G.players[p].ships.includes(s)) {
    const list = shipActions(s);
    const status = `${s.name}: ${s.fit}/${s.maxFit} fittings${isDead(s) ? ', dead in the water' : ''}${s.braced ? ', braced' : ''}.`;
    say(list.length && !(list.length === 1 && list[0].id === 'scuttle' && s.acted) ? status + ' Pick an action.' : status + ' Done this turn.');
    for (const a of list) acts.appendChild(btn(a.label, () => doShipAction(a), { act: a.id, disabled: a.disabled, title: a.why || '' }));
    acts.appendChild(btn('Back', () => { UI.sel = null; refresh(); }, { act: 'back' }));
    return;
  }

  const waiting = G.players[p].ships.filter(x => !x.acted).length;
  const left = `${waiting} ship${waiting === 1 ? '' : 's'} to go. Ships you leave sail on one click.`;
  say(!waiting ? 'Every ship has gone. End the turn.' : G.coinPhase ? `Spend coins now, or pick a ship. ${left}` : `Pick a ship. ${left}`);
  if (canDeclareVictory(p)) acts.appendChild(btn('Declare victory', declareVictory, { cls: 'gold', act: 'declare' }));
  if (reviveAllowed(p)) acts.appendChild(btn('Raise a sunk ship (2 coins)', startRevive, { act: 'revive' }));
  acts.appendChild(btn('End turn', endTurn, { cls: 'go', act: 'endturn' }));
}

// ═══ Menu, help, game over ════════════════════════════

function showMenu() {
  const m = $('menu');
  m.style.display = 'flex';
  const body = $('menuBody');
  body.innerHTML = '';
  const add = (label, fn, act) => body.appendChild(btn(label, fn, { act }));
  add('How to play', () => { hideMenu(); showHelp(); }, 'help');
  add(audioMuted ? 'Sound: off' : 'Sound: on', () => { toggleMute(); showMenu(); }, 'sound');
  add('Fit the table on screen', () => { camReset(); hideMenu(); }, 'fit');
  if (!isOnline()) for (const p of [1, 2]) add(`Player ${p}: ${aiControlled[p] ? 'computer' : 'human'}`, () => { aiControlled[p] = !aiControlled[p]; showMenu(); refresh(); kickAI(); }, 'ai' + p);
  if (isOnline()) add('Copy game link', () => NET.copyLink(), 'copylink');
  add('Fullscreen', () => { toggleFullscreen(); hideMenu(); }, 'fullscreen');
  add(isOnline() ? 'Leave game' : 'Quit to title', quitToTitle, 'quit');
  add('Close', hideMenu, 'close');
}
function hideMenu() { $('menu').style.display = 'none'; }
function showHelp() { $('help').style.display = 'flex'; $('help').scrollTop = 0; }
function hideHelp() { $('help').style.display = 'none'; }

function showGameOver() {
  if (!G || $('gameOver').style.display === 'flex') return;
  cancelMode(); refresh();
  const s = scoreBreakdown();
  const name = p => (isOnline() && p === NET.seat ? 'You' : seatName(p));
  $('winnerText').textContent = G.winner ? `${name(G.winner)} ${isOnline() && G.winner === NET.seat ? 'win' : 'wins'}` : 'A draw';
  $('winnerText').style.color = G.winner ? colorOf(G.winner).dark : '';
  const rows = G.order.slice().sort((a, b) => s[b].total - s[a].total).map(p => `<tr><td style="color:${colorOf(p).dark};font-weight:700">${esc(seatName(p))}<br><small>${esc(FACTION_DEFS[G.factions[p]].name)}</small></td>
    <td>${s[p].ships}</td><td>${s[p].islands}</td><td>${s[p].coins}</td><td>${s[p].bonus}</td><td><b>${s[p].total}</b></td>
    <td>${G.stats[p].hits}/${G.stats[p].shots}</td></tr>`).join('');
  $('statsText').innerHTML = `<p>${esc(G.endReason)}</p>
    <table class="bookTable"><tr><th></th><th>Ships</th><th>Islands</th><th>Coins</th><th>Bonus</th><th>Total</th><th>Hits</th></tr>${rows}</table>
    <p class="small">${G.turn} turns played.</p>`;
  $('againBtn').textContent = isOnline() ? 'Back to lobby' : 'Play again';
  $('gameOver').style.display = 'flex';
  sfxVictory();
}

function playAgain() {
  $('gameOver').style.display = 'none';
  if (isOnline()) { NET.leave(); showOnline(); } else showSetup();
}

// ═══ Local computer players ════════════════════════════

let aiRunning = false;
function kickAI() { setTimeout(aiMaybeAct, 300 / GAME_SPEED); }

/** Show the computer's aim on the table for a moment before it fires. */
async function aiShowAim(a) {
  const ship = shipById(a.ship);
  if (!ship) return;
  const F = { ship, source: a.source, island: a.island != null ? G.terrain[a.island] : null, slots: [], slotIdx: a.slot, h: a.h, stage: 'power', fixed: rangeToPower(a.aimD || a.D) };
  F.slot = a.source === 'ship' ? shipSlots(ship)[a.slot] : null;
  UI.mode = 'fire'; UI.fire = F; UI.sel = ship;
  refresh();
  await sleep(AI_DELAY * 0.9);
  if (UI.fire === F) { UI.mode = null; UI.fire = null; }
}

async function aiMaybeAct() {
  if (!G || isOnline() || aiRunning || UI.busy || G.phase === 'over') return;
  if (!aiControlled[G.active]) return;
  aiRunning = true;
  try {
    await sleep(AI_DELAY);
    if (!G || !aiControlled[G.active] || isOnline()) return;
    const p = G.active;
    if (G.phase === 'islands') randomSetupPiece();
    else if (G.phase === 'terrain') {
      if (G.terrainPlaced[p] < 1 + Math.floor(Math.random() * 2)) { UI.placeType = Math.random() < 0.5 ? 'rock' : 'reef'; randomSetupPiece(); }
      else terrainDone();
    } else if (G.phase === 'deploy') {
      autoDeploy(p); refresh();
      await sleep(AI_DELAY);
      deployConfirm();
    } else if (G.phase === 'play') {
      let guard = 0;
      while (G && G.phase === 'play' && aiControlled[G.active] && G.active === p && guard++ < 80) {
        const a = aiNextAction(p);
        if (a.ship) { UI.sel = shipById(a.ship); refresh(); await sleep(AI_DELAY * 0.5); }
        if (a.t === 'fire') await aiShowAim(a);
        const res = await perform(a);
        if (!res.ok) {
          console.warn('Computer move refused:', JSON.stringify(a), res.err);
          if (a.t === 'endTurn') break;
          await perform({ t: 'endTurn' });
          break;
        }
        UI.sel = null;
        if (a.t === 'endTurn' || a.t === 'declare') break;
        await sleep(AI_DELAY * 0.4);
      }
      if (G && G.phase === 'play' && G.active === p && aiControlled[p]) await perform({ t: 'endTurn' });
    }
  } catch (err) {
    console.error(err);
  } finally {
    aiRunning = false;
  }
  if (G && G.phase !== 'over' && aiControlled[G.active]) kickAI();
}

window.addEventListener('DOMContentLoaded', () => {
  showScreen('titleScreen');
  const t = $('helpCoins');
  if (t) t.insertAdjacentHTML('beforeend', COIN_ORDER.map(id => `<tr><td><img src="${COIN_DEFS[id].img}" alt=""></td><td><b>${esc(COIN_DEFS[id].name)}</b></td><td>${esc(COIN_DEFS[id].text)}</td></tr>`).join(''));
  if (typeof NET !== 'undefined') NET.boot();
});
