// Cannons & Coastlines, digital edition: view3d.js
// The table in 3D: the real ship models on the sea, with a camera that
// moves between ships.
//
// game3d.js (bundled from nuxt-site/app/lib/game3d.ts) draws the scene.
// This file connects it to the game: each frame it describes the ships and
// terrain to it, and it replaces renderer.js's table-to-screen functions
// (w2s, s2w, sdir, ...) with ones that go through the 3D camera, so every
// on-table control in main.js lands where it should. Drawing that stays
// flat (rings, lanes, chips, text) is redone here along the 3D table.
//
// Without WebGL, or with ?2d in the URL, nothing here runs and the game
// keeps its top-down view.
(function () {
  'use strict';
  if (typeof CNC3D === 'undefined' || /[?&]2d\b/.test(location.search) || !CNC3D.supported()) return;
  // window.VIEW3D.view is the 3D view, for debugging from the console.
  window.VIEW3D = { get view() { return V; } };

  const pref = (k, d) => { try { return localStorage.getItem('cnc-' + k) || d; } catch (e) { return d; } };
  const setPref = (k, v) => { try { localStorage.setItem('cnc-' + k, v); } catch (e) { /* private mode */ } };
  const opts = {
    weather: pref('weather', 'fleet'),
    // auto: the 3D view picks a level for the device and adjusts it to the frame rate.
    quality: pref('quality', 'auto'),
    follow: pref('follow', 'on') === 'on',
    top: pref('view', 'angled') === 'top',
  };
  const PITCH_ANGLED = 0.64, PITCH_TOP = 1.5;
  // How close the camera comes in to a ship it focuses (mm from the water).
  const SHIP_DIST = 820;
  let V = null;
  let lastUser = -1e9;
  let frameT = 0;
  const gunAt = new Map();      // ship id -> the slot its gun last fired from
  const islandGunAt = new Map(); // island id -> the slot its gun last fired from

  const userBusy = () => performance.now() - lastUser < 2500;
  function userMoved() { lastUser = performance.now(); if (V) V.setFollow(null); }

  // ─── Setup ──────────────────────────────────────────

  const initCanvas2D = initCanvas;
  initCanvas = function () {
    initCanvas2D();
    V = CNC3D.create(canvas.parentElement, { quality: opts.quality });
    canvas.classList.add('over3d');
    const btns = document.getElementById('camBtns');
    if (btns) {
      const add = (html, title, fn) => {
        const b = document.createElement('button');
        b.innerHTML = html; b.title = title; b.setAttribute('aria-label', title);
        b.addEventListener('click', e => { e.stopPropagation(); fn(); });
        btns.appendChild(b);
      };
      add('&#8634;', 'Turn view left', () => camRotate(-Math.PI / 8));
      add('&#8635;', 'Turn view right', () => camRotate(Math.PI / 8));
      add('&#9707;', 'Top-down or angled view', toggleTop);
    }
    window.addEventListener('keydown', e => {
      if (!G || (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT'))) return;
      if (e.key === 'q' || e.key === 'Q') camRotate(-Math.PI / 12);
      else if (e.key === 'e' || e.key === 'E') camRotate(Math.PI / 12);
      else if (e.key === 't' || e.key === 'T') toggleTop();
    });
  };

  const resizeCanvas2D = resizeCanvas;
  resizeCanvas = function () {
    resizeCanvas2D();
    if (V) V.resize(canvasW, canvasH);
  };

  function toggleTop() {
    opts.top = !opts.top;
    setPref('view', opts.top ? 'top' : 'angled');
    V.goal.pitch = opts.top ? PITCH_TOP : PITCH_ANGLED;
    if (opts.top) V.goal.yaw = Math.round(V.goal.yaw / (Math.PI / 2)) * (Math.PI / 2);
    V.clampGoal();
  }

  /** Whose side of the table the camera sits on: yours online, or the local human's. */
  function viewerSeat() {
    if (isOnline()) return NET.seat != null ? NET.seat : G.order[0];
    const humans = G.order.filter(p => !aiControlled[p]);
    if (humans.length === 1) return humans[0];
    return humans.length ? G.active : G.order[0];
  }
  function homeYaw(p) {
    if (!G) return 0;
    if (G.table.shape === 'circle') { const a = seatHome(p).a; return Math.atan2(Math.cos(a), Math.sin(a)); }
    return p === 2 ? Math.PI : 0;
  }
  function weather() {
    if (opts.weather !== 'fleet') return opts.weather;
    const p = G ? viewerSeat() : 1;
    return CNC3D.atmosphereOf(G && G.factions[p] ? G.factions[p] : 'queens_fleet');
  }

  // ─── Camera ─────────────────────────────────────────

  applyCamera = function () { if (V) worldScale = V.pxPerCm(); };
  camReset = function () {
    if (!V || !G) return;
    userMoved();
    V.setTable(G.table);
    V.camOverview(opts.top ? Math.round(V.goal.yaw / (Math.PI / 2)) * (Math.PI / 2) : V.goal.yaw, opts.top ? PITCH_TOP : PITCH_ANGLED);
  };
  camHome = function () {
    if (!V || !G) return;
    V.setTable(G.table);
    V.setAtmosphere(weather());
    V.preload(G.order.map(p => G.factions[p]));
    V.camOverview(homeYaw(viewerSeat()), opts.top ? PITCH_TOP : PITCH_ANGLED, true);
  };
  camZoomAt = function (sx, sy, factor) {
    if (!V) return;
    userMoved();
    const P = s2w(sx, sy), g = V.goal;
    const nd = clamp(g.dist / factor, V.distMin, V.distMax), k = 1 - nd / g.dist;
    g.tx += (P.x - g.tx) * k; g.ty += (P.y - g.ty) * k; g.dist = nd;
    V.clampGoal();
  };
  camPan = function (dx, dy) {
    if (!V) return;
    userMoved();
    const a = s2w(canvasW / 2, canvasH / 2), b = s2w(canvasW / 2 - dx, canvasH / 2 - dy);
    // Moves at once with the finger, not with the glide.
    for (const c of [V.cam, V.goal]) { c.tx += b.x - a.x; c.ty += b.y - a.y; }
    V.clampGoal();
    V.cam.tx = V.goal.tx; V.cam.ty = V.goal.ty;
  };
  camLookAt = function (x, y, zoom) { if (V) V.camFocus(x, y, V.goal.dist / Math.max(1, zoom)); };
  camCanOrbit = () => true;
  camOrbit = function (dx, dy) {
    if (!V) return;
    userMoved();
    for (const c of [V.cam, V.goal]) { c.yaw -= dx * 0.006; c.pitch += dy * 0.004; }
    V.clampGoal();
    V.cam.pitch = V.goal.pitch;
  };
  camRotate = function (rad) {
    if (!V || !rad) return;
    userMoved();
    V.goal.yaw -= rad;
  };
  // Aim a little up the screen from a ship, so it sits low in the view with
  // the table ahead of it rather than the water behind.
  function lead(x, y, d) {
    const k = d / 10 * 0.13;
    return { x: x - Math.sin(V.goal.yaw) * k * Math.cos(V.goal.pitch), y: y - Math.cos(V.goal.yaw) * k * Math.cos(V.goal.pitch) };
  }
  camFocusShip = function (ship, force) {
    if (!V || !ship || !ship.placed) return;
    if (!force && (!opts.follow || userBusy())) return;
    // Your own ships come in close; watching someone else's turn stays wider.
    const d = Math.min(V.goal.dist, isMyTurn() ? SHIP_DIST : SHIP_DIST * 1.5), p = lead(ship.x, ship.y, d);
    V.camFocus(p.x, p.y, d);
  };
  camFollowShip = function (ship) {
    if (!V) return;
    if (!ship) { V.setFollow(null); return; }
    if (!opts.follow || userBusy()) return;
    V.goal.dist = Math.min(V.goal.dist, SHIP_DIST * 1.2);
    V.setFollow(() => (ship.placed ? lead(ship.x, ship.y, V.goal.dist) : null));
  };
  camTurnStart = function (p) {
    if (!V || !G) return;
    const hotseat = !isOnline() && G.order.filter(q => !aiControlled[q]).length > 1;
    if (hotseat) V.goal.yaw = homeYaw(p);
    if (!opts.follow) return;
    const ships = G.players[p].ships.filter(s => s.placed);
    if (!ships.length) return;
    const cx = ships.reduce((n, s) => n + s.x, 0) / ships.length, cy = ships.reduce((n, s) => n + s.y, 0) / ships.length;
    const spread = Math.max(...ships.map(s => dist(cx, cy, s.x, s.y)));
    // Look a little past the fleet, toward the middle of the table, where it is heading.
    const c = tableCenter();
    V.camFocus(cx + (c.x - cx) * 0.25, cy + (c.y - cy) * 0.25, clamp(spread * 10 * 2.4 + 900, SHIP_DIST, V.distMax));
  };
  /** After one of your ships has gone, glide to the nearest one still to go. */
  camNextShip = function () {
    if (!V || !G || !opts.follow || userBusy() || UI.sel) return;
    const left = G.players[G.active].ships.filter(s => s.placed && !s.acted);
    if (!left.length) return;
    const g = V.goal;
    left.sort((a, b) => dist(a.x, a.y, g.tx, g.ty) - dist(b.x, b.y, g.tx, g.ty));
    setTimeout(() => camFocusShip(left[0]), 350);
  };
  noteShot = function (ship, origin, h) {
    const slots = shipSlots(ship);
    let best = null, bd = Infinity;
    for (const sl of slots) {
      if (sl.free) continue;
      const w = slotWorld(ship, sl), d = dist(w.x, w.y, origin.x, origin.y);
      if (d < bd) { bd = d; best = sl; }
    }
    if (best && bd < 1.5) { gunAt.set(ship.id, best); return; }
    // Not a ship slot: an island gun, fired from the slot whose shot starts here.
    for (const t of G.terrain) {
      if (t.type !== 'island') continue;
      const k = islandSlots(t).findIndex(sl => { const o = islandGunOrigin(t, sl.h); return dist(o.x, o.y, origin.x, origin.y) < 0.5; });
      if (k >= 0) { islandGunAt.set(t.id, k); return; }
    }
  };

  // ─── Table <-> screen ───────────────────────────────

  w2s = (x, y) => V.project(x, y, 0);
  w2s3 = (x, y, h) => V.project(x, y, h || 0);
  s2w = (sx, sy) => V.unproject(sx, sy);
  w2r = r => r * worldScale;
  sdir = function (x, y, dx, dy) {
    const l = Math.hypot(dx, dy) || 1, a = V.project(x, y, 0), b = V.project(x + dx / l, y + dy / l, 0);
    const sx = b.x - a.x, sy = b.y - a.y, sl = Math.hypot(sx, sy) || 1;
    return { x: sx / sl, y: sy / sl };
  };
  moveHandleScreen = function (m) {
    const f = fwdVec(m.plan.rot.h), R = m.ship.len * 1.1;
    return w2s(m.ship.x + f.x * R, m.ship.y + f.y * R);
  };
  aimHandleScreen = function (F) {
    const p = aimPivot(F), c = w2s(p.x, p.y), f = fwdVec(F.h), R = Math.max(9, 34 / Math.max(0.1, worldScale));
    const k = w2s(p.x + f.x * R, p.y + f.y * R);
    return { x: k.x, y: k.y, cx: c.x, cy: c.y, R: Math.hypot(k.x - c.x, k.y - c.y), wR: R, p };
  };

  // Picking a ship by where it looks on screen, sails and all, not just
  // the hull's footprint on the water.
  pickShip = function (w, p) {
    const sp = w2s(w.x, w.y);
    const tap = lastTap || sp;
    let best = null, bd = Infinity;
    for (const s of G.players[p].ships) {
      if (!s.placed) continue;
      const f = fwdVec(s.h), hl = Math.max(0, s.len / 2 - s.wid / 2);
      const a = w2s3(s.x + f.x * hl, s.y + f.y * hl, 1.2), b = w2s3(s.x - f.x * hl, s.y - f.y * hl, 1.2);
      const base = w2s3(s.x, s.y, 1.2), top = w2s3(s.x, s.y, isDead(s) ? 2.5 : 8);
      const halfW = s.wid / 2 * worldScale;
      const dHull = ptSegDist(tap.x, tap.y, a.x, a.y, b.x, b.y) - halfW;
      const dMast = ptSegDist(tap.x, tap.y, base.x, base.y, top.x, top.y) - Math.max(10, s.len * worldScale * 0.3);
      const d = Math.min(dHull, dMast);
      if (d < 14 && d < bd) { bd = d; best = s; }
    }
    return best;
  };
  // pickShip gets a table point; keep the screen point it came from.
  let lastTap = null;
  const eventWorld2D = eventWorld;
  eventWorld = function (e) {
    const r = canvas.getBoundingClientRect();
    lastTap = { x: e.clientX - r.left, y: e.clientY - r.top };
    return eventWorld2D(e);
  };

  // ─── Descriptions for the 3D scene ──────────────────

  function describe(ship, pose, fitOverride) {
    const layout = fittingLayout(ship), mask = fitOverride || fitMaskOf(ship);
    const d = { id: ship.id, faction: ship.build, x: pose.x, y: pose.y, h: pose.h, masts: [], cargo: [], turret: false, stack: false,
      turretRel: ship.turretRel || 0, dead: !mask.some(Boolean), braced: !!ship.braced, color: colorOf(ship.owner).main, ring: 0.55, gun: null };
    layout.forEach((f, i) => {
      const on = !!mask[i];
      if (f.kind === 'mast') d.masts.push(on);
      else if (f.kind === 'cargo') d.cargo.push(on);
      else if (f.kind === 'turret') d.turret = on;
      else if (f.kind === 'stack') d.stack = on;
    });
    const F = UI.fire;
    const mine = F && F.source === 'ship' && F.ship && F.ship.id === ship.id;
    if (mine && F.slot && F.slot.free) d.turretRel = F.h - pose.h;
    // The gun sits in the slot being picked, else the one it last fired from.
    let sl = gunAt.get(ship.id) || null;
    if (mine && F.slot && !F.slot.free) sl = F.slot;
    else if (mine && F.stage === 'slot' && F.hover >= 0 && F.slots[F.hover] && !F.slots[F.hover].free) sl = F.slots[F.hover];
    if (sl) d.gun = { dir: sl.dir, lx: sl.lx, ly: sl.ly };
    return d;
  }

  function shipDescs() {
    const out = [];
    const myTurn = G.phase === 'play' && isMyTurn();
    for (const p of G.order) for (const s of G.players[p].ships) {
      if (!s.placed) continue;
      const d = describe(s, s);
      if (G.phase === 'play' && s.owner === G.active) d.ring = s.acted && !s.pending ? 0.25 : myTurn ? 0.9 : 0.7;
      else d.ring = 0.5;
      out.push(d);
    }
    return out;
  }

  function terrainDescs() {
    const F = UI.fire;
    return G.terrain.map((t) => {
      // An island's gun sits in the slot being picked, else the one it last fired from.
      let gun = islandGunAt.has(t.id) ? islandGunAt.get(t.id) : null;
      if (F && F.source === 'island' && F.island && F.island.id === t.id) {
        if (F.slot && F.slot.island != null) gun = F.slot.k;
        else if (F.hover >= 0) gun = F.hover;
      }
      return { id: t.id, type: t.type, x: t.x, y: t.y, r: t.r, owner: t.owner ? colorOf(t.owner).main : null, turn: islandTurn(t), gun };
    });
  }

  // ─── Flat drawing along the 3D table ────────────────

  /** Add a table-space arc to the current path (angles as in ctx.arc on the old top-down table). */
  function gArc(x, y, r, a0, a1) {
    let span = a1 - a0;
    if (span <= 0) span += TAU;
    const n = Math.max(10, Math.ceil(span / TAU * 72));
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const a = a0 + span * i / n, q = V.project(x + Math.cos(a) * r, y + Math.sin(a) * r, 0);
      if (q.z > 1) { pen = false; continue; }
      if (pen) ctx.lineTo(q.x, q.y); else { ctx.moveTo(q.x, q.y); pen = true; }
    }
  }
  const gCircle = (x, y, r) => gArc(x, y, r, 0, TAU);
  function gPoly(pts) {
    pts.forEach(([x, y], i) => { const q = w2s(x, y); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
    ctx.closePath();
  }
  function gLine(x1, y1, x2, y2, n = 16) {
    for (let i = 0; i <= n; i++) {
      const q = w2s(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n);
      if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
    }
  }
  function strokeRing(x, y, r, style, width, dash) {
    ctx.strokeStyle = style; ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); gCircle(x, y, r); ctx.stroke();
    if (dash) ctx.setLineDash([]);
  }

  drawFrame = function () {
    if (!V || !V.frameDue()) return;
    V.setTable(G.table);
    V.setAtmosphere(weather());
    frameT = V.beginFrame();
    worldScale = V.pxPerCm();
    ctx.clearRect(0, 0, canvasW, canvasH);
    V.syncTerrain(terrainDescs(), frameT);
    V.syncShips(shipDescs(), frameT);
    drawTable();
    drawSetupOverlay();
    drawTerrain();
    drawMovePreview();
    drawEvasivePreview();
    drawShips();
    drawFirePreview();
    drawAnimations(ctx);
    drawControls();
    V.render(frameT);
    if (V.loading()) {
      ctx.font = 'italic 15px "Crimson Text",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(250,243,224,.9)'; ctx.fillText('Bringing the fleets up…', canvasW / 2, canvasH - 14);
    }
  };

  drawTable = function () {
    if (G.phase !== 'play' && G.phase !== 'over') return;
    if (G.table.shape === 'circle') {
      // Each seat's stretch of rim in its colour; the active one glows.
      const c = tableCenter(), R = G.table.r;
      for (const p of G.order) {
        const home = seatHome(p), span = 0.42 * TAU / G.order.length;
        const on = p === G.active && G.phase === 'play';
        ctx.strokeStyle = rgba(colorOf(p).rgb, on ? 0.75 + Math.sin(wavePhase * 3) * 0.15 : 0.4);
        ctx.lineWidth = on ? 5 : 3;
        ctx.beginPath(); gArc(c.x, c.y, R + 1.2, home.a - span, home.a + span); ctx.stroke();
      }
    } else {
      // Each seat's stretch of edge in its colour; the active one glows.
      for (const p of G.order) {
        const sg = seatEdgeSegment(p), on = p === G.active && G.phase === 'play';
        ctx.strokeStyle = rgba(colorOf(p).rgb, on ? 0.6 + Math.sin(wavePhase * 3) * 0.15 : 0.35);
        ctx.lineWidth = on ? 5 : 3;
        ctx.beginPath(); gLine(sg.x1, sg.y1, sg.x2, sg.y2, 12); ctx.stroke();
      }
    }
  };

  drawSetupOverlay = function () {
    const gh = UI.ghost;
    if (G.table.shape !== 'circle') {
      const W = G.table.w, H = G.table.h;
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      if (G.phase === 'islands') {
        const m = islandEdgeMin();
        ctx.beginPath(); gPoly([[0, 0], [W, 0], [W, H], [0, H]]); gPoly([[m, m], [m, H - m], [W - m, H - m], [W - m, m]]); ctx.fill('evenodd');
        ctx.strokeStyle = 'rgba(212,168,83,.5)'; ctx.setLineDash([6, 6]); ctx.lineWidth = 1.5;
        ctx.beginPath(); gPoly([[m, m], [W - m, m], [W - m, H - m], [m, H - m]]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (G.phase === 'terrain') {
        ctx.beginPath(); for (const p of G.order) gPoly(seatStrip(p, DEPLOY_STRIP)); ctx.fill();
      }
      if (G.phase === 'deploy') {
        ctx.fillStyle = rgba(colorOf(G.active).rgb, 0.16 + Math.sin(wavePhase * 3) * 0.05);
        ctx.beginPath(); gPoly(seatStrip(G.active, 15)); ctx.fill();
      }
    }
    if (gh && (G.phase === 'islands' || G.phase === 'terrain')) {
      V.ghostTerrain({ id: 99, type: gh.type, x: gh.x, y: gh.y, r: gh.r, owner: null, turn: islandTurn({ id: G.terrain.length }), gun: null }, gh.ok);
      strokeRing(gh.x, gh.y, gh.r + 0.6, gh.ok ? 'rgba(80,220,120,.9)' : 'rgba(240,80,60,.9)', 2);
    }
    if (gh && G.phase === 'deploy' && gh.ship) {
      drawShipBody(gh.ship, gh.pose, 0.5, true);
      strokeRing(gh.pose.x, gh.pose.y, gh.ship.len * 0.6, gh.ok ? 'rgba(80,220,120,.9)' : 'rgba(240,80,60,.9)', 2);
    }
  };

  drawTerrain = function () {
    for (const t of G.terrain) if (t.owner) strokeRing(t.x, t.y, t.r + 0.8, rgba(colorOf(t.owner).rgb, 0.8), 2);
  };

  drawShipBody = function (ship, pose, alpha) {
    V.ghost(describe(ship, pose), alpha, frameT);
  };

  drawShip = function (ship) {
    const mine = G.phase === 'play' && ship.owner === G.active;
    const R = ship.len * 0.62;
    if (UI.hoverShip === ship) {
      strokeRing(ship.x, ship.y, R + 0.8, 'rgba(255,215,110,.8)', 2.5);
    }
    if (UI.sel === ship) strokeRing(ship.x, ship.y, R, `rgba(255,215,110,${0.6 + Math.sin(wavePhase * 5) * 0.35})`, 2.5);
    else if (UI.targets && UI.targets.includes(ship)) strokeRing(ship.x, ship.y, R, `rgba(90,230,140,${0.55 + Math.sin(wavePhase * 5) * 0.3})`, 2, [5, 4]);
    if (ship.braced) strokeRing(ship.x, ship.y, R + 1.2, `rgba(241,196,15,${0.45 + Math.sin(wavePhase * 4) * 0.2})`, 2);
    if (passiveOf(ship.owner) === 'stone' && !ship.stoneUsed) strokeRing(ship.x, ship.y, R + 0.4, 'rgba(220,210,180,.45)', 3);
    // Badges over the masthead: Skilled Gunner, extra turns, gave its action away.
    const badge = (ship.gunner ? COIN_DEFS.gunner.icon : '') + (ship.turnsLeft > 1 && !ship.acted ? ` x${ship.turnsLeft}` : '') + (ship.fullSail && !ship.acted ? ' ' + COIN_DEFS.fullsail.icon : '');
    const top = w2s3(ship.x, ship.y, isDead(ship) ? 3 : 11);
    if (badge) {
      ctx.font = 'bold 15px "Crimson Text",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(badge, top.x, top.y - 2);
      ctx.fillStyle = '#faf3e0'; ctx.fillText(badge, top.x, top.y - 2);
    }
    if (worldScale > 3.2 || UI.sel === ship) {
      // The name just below the hull on screen.
      const q = w2s3(ship.x, ship.y, 0);
      ctx.font = '13px "Crimson Text",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = isDead(ship) ? ship.name + ' (dead)' : ship.name;
      const lx = q.x, ly = q.y + ship.wid * 0.5 * worldScale + 12;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(label, lx, ly);
      ctx.fillStyle = isDead(ship) ? 'rgba(255,190,170,.95)' : mine && !ship.acted ? '#fff3c8' : 'rgba(240,240,232,.92)';
      ctx.fillText(label, lx, ly);
    }
  };

  drawMovePreview = function () {
    const m = UI.move;
    if (UI.mode !== 'move' || !m || !m.plan) return;
    const ship = m.ship, plan = m.plan;
    if (!m.lockHeading) {
      const piv = pivotFor(ship) * Math.PI / 180, R = ship.len * 1.1;
      ctx.fillStyle = 'rgba(80,220,140,.13)'; ctx.strokeStyle = 'rgba(80,220,140,.55)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      if (piv >= Math.PI - 1e-3) gCircle(ship.x, ship.y, R);
      else {
        const c = w2s(ship.x, ship.y); ctx.moveTo(c.x, c.y);
        gArc(ship.x, ship.y, R, ship.h - piv - Math.PI / 2, ship.h + piv - Math.PI / 2);
        ctx.lineTo(c.x, c.y);
      }
      ctx.fill(); ctx.stroke();
      const c = w2s(ship.x, ship.y), k = moveHandleScreen(m);
      ctx.strokeStyle = 'rgba(250,243,224,.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(k.x, k.y); ctx.stroke();
      ctx.fillStyle = m.locked ? '#8b1a1a' : '#faf3e0'; ctx.strokeStyle = m.locked ? '#faf3e0' : '#3c2415'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(k.x, k.y, m.locked ? 11 : 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = m.locked ? '#faf3e0' : '#3c2415';
      ctx.beginPath(); ctx.arc(k.x, k.y, 3, 0, TAU); ctx.fill();
    }
    const f = fwdVec(plan.rot.h);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); gLine(plan.end.x, plan.end.y, plan.start.x + f.x * plan.planned, plan.start.y + f.y * plan.planned, 6); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(90,240,150,.95)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); gLine(plan.start.x, plan.start.y, plan.end.x, plan.end.y, 8); ctx.stroke();
    for (let k = 1; k <= plan.clicks; k++) {
      const d = k * CLICK_LEN, p = w2s(plan.start.x + f.x * d, plan.start.y + f.y * d);
      ctx.fillStyle = d <= plan.moved + 0.01 ? 'rgba(90,240,150,1)' : 'rgba(255,255,255,.4)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, TAU); ctx.fill();
    }
    drawShipBody(ship, plan.end, 0.45, true);
    if (plan.stoppedBy) {
      const bow = w2s3(plan.end.x + f.x * ship.len / 2, plan.end.y + f.y * ship.len / 2, 1.5);
      ctx.strokeStyle = 'rgba(255,110,80,.95)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(bow.x - 6, bow.y - 6); ctx.lineTo(bow.x + 6, bow.y + 6); ctx.moveTo(bow.x + 6, bow.y - 6); ctx.lineTo(bow.x - 6, bow.y + 6); ctx.stroke();
    }
  };

  drawEvasivePreview = function () {
    if (UI.mode !== 'evasive' || !UI.evasive) return;
    for (const side of ['port', 'stbd']) {
      const pl = UI.evasive[side];
      const on = UI.evasive.pick === side || UI.evasive.hover === side;
      drawShipBody(UI.evasive.ship, pl.end, UI.evasive.pick === side ? 0.85 : on ? 0.65 : 0.4, true);
    }
  };

  // The shot's path, lifted into its real arc: solid where the ball is low
  // enough to touch a hull, dashed where it flies over, with its shadow on
  // the water and a ring where it lands.
  drawLane = function (ox, oy, h, elev, strong) {
    const path = shotPath(ox, oy, aimedShot(h, elev)), total = path.total, step = 0.5;
    for (const k of [-1, 1]) {
      const f = fwdVec(h + k * SPREAD_MAX);
      ctx.strokeStyle = 'rgba(255,200,180,.3)'; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
      ctx.beginPath(); gLine(ox, oy, ox + f.x * RANGE_MAX, oy + f.y * RANGE_MAX, 12); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.28)'; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let s = 0; s <= total + 1e-6; s += 2) { const a = pathAt(path, s), q = w2s3(a.x, a.y, 0); s ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); }
    ctx.stroke();
    let prev = null, prevLow = null;
    for (let s = 0; s <= total + 1e-6; s += step) {
      const at = pathAt(path, s), hg = at.z, low = hg < HULL_H;
      const q = w2s3(at.x, at.y, hg + 0.5);
      if (prev) {
        ctx.strokeStyle = low ? (strong ? 'rgba(255,90,70,.95)' : 'rgba(255,90,70,.6)') : 'rgba(255,215,195,.55)';
        ctx.lineWidth = low ? (strong ? 3 : 2) : 1.4;
        ctx.setLineDash(low ? [] : [4, 5]);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
      prev = q; prevLow = low;
    }
    ctx.setLineDash([]);
    const land = pathAt(path, path.legs[0].s1);
    strokeRing(land.x, land.y, 1.5, 'rgba(255,230,120,.95)', 2);
  };

  drawFirePreview = function () {
    const F = UI.fire;
    if (UI.mode !== 'fire' || !F) return;
    if (F.stage === 'slot') {
      F.slots.forEach((sl, i) => {
        const hot = F.hover === i, w = slotWorld(F.ship, sl), o = w2s3(w.x, w.y, 1.5);
        if (!sl.free) {
          const fv = fwdVec(w.h);
          ctx.strokeStyle = hot ? 'rgba(255,120,90,.95)' : 'rgba(255,120,90,.4)'; ctx.lineWidth = hot ? 2.5 : 1.5; ctx.setLineDash([4, 6]);
          ctx.beginPath(); gLine(w.x, w.y, w.x + fv.x * RANGE_MAX, w.y + fv.y * RANGE_MAX, 12); ctx.stroke(); ctx.setLineDash([]);
        } else strokeRing(w.x, w.y, RANGE_MAX * 0.5, 'rgba(255,120,90,.4)', 1.5, [4, 6]);
        const r = (hot ? 1.4 : 1) * 6;
        ctx.fillStyle = hot ? 'rgba(139,26,26,.95)' : 'rgba(230,185,90,.95)'; ctx.strokeStyle = 'rgba(20,10,5,.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill(); ctx.stroke();
      });
      return;
    }
    const o = fireOrigin(F);
    if (F.stage === 'dir') {
      drawLane(o.x, o.y, o.h, F.elev, false);
      const hk = aimHandleScreen(F);
      ctx.strokeStyle = 'rgba(250,243,224,.85)'; ctx.lineWidth = 1.5;
      strokeRing(hk.p.x, hk.p.y, hk.wR, 'rgba(250,243,224,.85)', 1.5, [3, 3]);
      ctx.fillStyle = F.locked ? '#8b1a1a' : '#faf3e0'; ctx.strokeStyle = F.locked ? '#faf3e0' : '#8b1a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(hk.x, hk.y, F.locked ? 11 : 9, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = F.locked ? '#faf3e0' : '#8b1a1a'; ctx.beginPath(); ctx.arc(hk.x, hk.y, 3, 0, TAU); ctx.fill();
      return;
    }
    if (F.stage === 'power') drawLane(o.x, o.y, o.h, F.elev, true);
  };

  // ─── Animations ─────────────────────────────────────

  drawAnimations = function (ctx) {
    let ballAt = null;
    for (const a of animations) {
      const p = a.progress || 0;
      switch (a.type) {
        case 'ball': {
          const s = a.stopS * p, at = pathAt(a.path, s), gx = at.x, gy = at.y;
          V.ball(gx, gy, at.z);
          ballAt = { x: a.ox + (gx - a.ox) * 0.6, y: a.oy + (gy - a.oy) * 0.6 };
          if (p < 0.12) {
            const o = w2s3(a.ox, a.oy, 1.4), q = 1 - p / 0.12;
            ctx.fillStyle = `rgba(255,170,70,${0.75 * q})`;
            ctx.beginPath(); ctx.arc(o.x, o.y, 10 + worldScale * 1.2, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'ricochet': {
          const f = fwdVec(a.h), s = 4 * p;
          V.ball(a.x + f.x * s, a.y + f.y * s, Math.sin(p * Math.PI) * 1.2);
          break;
        }
        case 'wake': strokeRing(a.x, a.y, 0.4 + p * 2.5, `rgba(220,240,255,${0.45 * (1 - p)})`, 1.2); break;
        case 'splash': {
          strokeRing(a.x, a.y, 0.4 + p * 3.2, `rgba(200,235,255,${1 - p})`, 2.5 - p * 1.5);
          strokeRing(a.x, a.y, 0.2 + p * 1.6, `rgba(240,250,255,${0.7 - p * 0.7})`, 1.2);
          // A spout of spray.
          const b = w2s3(a.x, a.y, 0), t = w2s3(a.x, a.y, Math.sin(Math.min(1, p * 1.6) * Math.PI) * 3.5);
          ctx.strokeStyle = `rgba(235,248,255,${0.8 * (1 - p)})`; ctx.lineWidth = 3 + worldScale * 0.6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(t.x, t.y); ctx.stroke(); ctx.lineCap = 'butt';
          break;
        }
        case 'hit': {
          const g = w2s3(a.x, a.y, 2), r = Math.max(10, worldScale * 2.5);
          ctx.fillStyle = `rgba(255,140,0,${(1 - p) * 0.85})`;
          ctx.beginPath(); ctx.arc(g.x, g.y, r * (1 + p * 0.6), 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(255,255,200,${(1 - p) * 0.6})`;
          ctx.beginPath(); ctx.arc(g.x, g.y, r * 0.4, 0, TAU); ctx.fill();
          break;
        }
        case 'thud': {
          const g = w2s3(a.x, a.y, 1.5);
          ctx.fillStyle = `rgba(190,170,130,${(1 - p) * 0.7})`;
          ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(7, worldScale * 1.5) * (1 + p), 0, TAU); ctx.fill();
          break;
        }
        case 'sparkle': {
          const g = w2s3(a.x, a.y, 4);
          for (let i = 0; i < 8; i++) {
            const ang = i * TAU / 8 + p * 3, r = 6 + p * 20;
            ctx.fillStyle = `rgba(255,220,120,${(1 - p) * 0.9})`;
            ctx.beginPath(); ctx.arc(g.x + Math.cos(ang) * r, g.y + Math.sin(ang) * r, 2.5 - p * 1.5, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'sinking': {
          ctx.fillStyle = `rgba(5,20,40,${(1 - p) * 0.35})`;
          ctx.beginPath(); gCircle(a.x, a.y, 3 + p * 4); ctx.fill();
          for (let i = 0; i < 6; i++) {
            const g = w2s3(a.x + Math.sin(p * 9 + i * 2) * 2.5, a.y + Math.cos(p * 7 + i * 3) * 1.5, p * 2);
            ctx.fillStyle = `rgba(200,230,250,${Math.max(0, 0.8 - p) * 0.7})`;
            ctx.beginPath(); ctx.arc(g.x, g.y, 1.5 + i * 0.5, 0, TAU); ctx.fill();
          }
          break;
        }
        case 'ring': strokeRing(a.x, a.y, 5 + p * 1.5, `rgba(${a.col},${Math.sin(p * Math.PI) * 0.9})`, 3); break;
        case 'flag': strokeRing(a.x, a.y, 2 + p * 7, `rgba(${a.col},${1 - Math.max(0, p - 0.6) * 2.5})`, 2); break;
        case 'boarding': {
          const q = Math.min(1, p * 1.6);
          const g = w2s3(a.x1 + (a.x2 - a.x1) * q, a.y1 + (a.y2 - a.y1) * q, 4);
          ctx.fillStyle = `rgba(255,210,80,${p < 0.6 ? 1 : (1 - p) * 2.5})`;
          ctx.font = '22px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('⚔', g.x, g.y);
          break;
        }
        case 'text': {
          const g = w2s3(a.x, a.y, 9);
          ctx.font = 'bold 18px "Crimson Text",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.lineWidth = 3; ctx.strokeStyle = `rgba(0,0,0,${0.6 * (1 - p)})`;
          ctx.strokeText(a.text, g.x, g.y - 10 - p * 24);
          ctx.fillStyle = `rgba(${a.col},${1 - p * p})`;
          ctx.fillText(a.text, g.x, g.y - 10 - p * 24);
          break;
        }
        case 'smoke': {
          const f = fwdVec(a.h);
          if (p < 0.2) {
            const q = p / 0.2, g = w2s3(a.x + f.x * 0.8 * q, a.y + f.y * 0.8 * q, 1.4);
            ctx.fillStyle = `rgba(255,190,80,${0.9 * (1 - q)})`;
            ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(5, worldScale * 1.3) * (1 + q), 0, TAU); ctx.fill();
          }
          for (let i = 0; i < 5; i++) {
            const d = (1 + i) * 0.9 * p * (REDUCED_MOTION ? 0.3 : 1);
            const g = w2s3(a.x + f.x * d * 2 + Math.sin(i * 2.1) * p, a.y + f.y * d * 2 + Math.cos(i * 1.7) * p, 1.4 + p * (2 + i * 0.6));
            ctx.fillStyle = `rgba(225,222,215,${0.5 * (1 - p)})`;
            ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(4, worldScale * 0.9) * (1 + p * 2.2) * (1 - i * 0.1), 0, TAU); ctx.fill();
          }
          break;
        }
        case 'fitting':
          if (!a.key) a.key = ++fallKeys;
          V.fittingFall(a.key, a.shipId, a.role, a.dx, a.dy, p);
          if (p > 0.35) strokeRing(a.x + a.dx * (a.shipW * 0.5 + 2), a.y + a.dy * (a.shipW * 0.5 + 2), 0.5 + (p - 0.35) * 4, `rgba(220,240,255,${0.6 * (1 - p)})`, 1.2);
          break;
        case 'wreck':
          V.wreck(describe(a.ship, a.pose, Array(a.ship.maxFit).fill(false)), p, a.tilt, frameT);
          break;
        case 'bump': {
          const g = w2s3(a.x, a.y, 1.5);
          ctx.strokeStyle = `rgba(255,235,190,${1 - p})`; ctx.lineWidth = 2;
          for (let i = -1; i <= 1; i++) {
            const ang = i * 0.6 - Math.PI / 2;
            ctx.beginPath();
            ctx.moveTo(g.x + Math.cos(ang) * (4 + p * 6), g.y + Math.sin(ang) * (4 + p * 6));
            ctx.lineTo(g.x + Math.cos(ang) * (8 + p * 8), g.y + Math.sin(ang) * (8 + p * 8));
            ctx.stroke();
          }
          break;
        }
      }
    }
    // Follow the shot in flight, then settle where it lands.
    if (ballAt && opts.follow && !userBusy()) { V.goal.tx = ballAt.x; V.goal.ty = ballAt.y; V.clampGoal(); }
  };
  let fallKeys = 0;

  // ─── Menu ───────────────────────────────────────────

  const WEATHER_NAME = { fleet: 'your fleet’s', fair: 'fair', storm: 'storm', golden: 'golden hour', overcast: 'overcast', tropical: 'tropical', sunrise: 'sunrise' };
  window.view3dMenuItems = function (add) {
    add(`Camera: ${opts.follow ? 'follows the action' : 'stays put'}`, () => { opts.follow = !opts.follow; setPref('follow', opts.follow ? 'on' : 'off'); showMenu(); }, 'follow');
    add(`View: ${opts.top ? 'top-down' : 'angled'}`, () => { toggleTop(); showMenu(); }, 'view');
    add(`Weather: ${WEATHER_NAME[opts.weather] || opts.weather}`, () => {
      const all = ['fleet'].concat(CNC3D.atmospheres);
      opts.weather = all[(all.indexOf(opts.weather) + 1) % all.length];
      setPref('weather', opts.weather);
      showMenu();
    }, 'weather');
    const q = { auto: `auto (${CNC3D.LEVEL_NAMES[V.level]})`, high: 'always high', low: 'always fast' };
    add(`Graphics: ${q[opts.quality] || q.auto}`, () => {
      opts.quality = { auto: 'high', high: 'low', low: 'auto' }[opts.quality] || 'auto';
      setPref('quality', opts.quality);
      V.setQuality(opts.quality);
      showMenu();
    }, 'quality');
  };
})();
