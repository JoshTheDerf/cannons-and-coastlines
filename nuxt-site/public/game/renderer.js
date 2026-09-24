// Cannons & Coastlines, digital edition: renderer.js
// Top-down canvas drawing of the table.

let canvas, ctx;
let canvasW = 0, canvasH = 0;
let worldScale = 1, worldOffX = 0, worldOffY = 0;
let baseScale = 1;
// Camera: zoom 1 fits the whole table; cx, cy is the table point at the
// centre of the canvas.
const cam = { zoom: 1, cx: null, cy: null };

function initCanvas() {
  canvas = document.getElementById('boardCanvas');
  ctx = canvas.getContext('2d');
}

function resizeCanvas() {
  if (!canvas) return;
  const wrap = canvas.parentElement;
  const w = Math.max(50, wrap.clientWidth), h = Math.max(50, wrap.clientHeight);
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvasW = w; canvasH = h;
  applyCamera();
}

function applyCamera() {
  if (!G || !G.table) return;
  const sz = tableSize(), pad = 10;
  baseScale = Math.min((canvasW - pad * 2) / sz.w, (canvasH - pad * 2) / sz.h);
  cam.zoom = clamp(cam.zoom, 1, 6);
  const c = tableCenter();
  if (cam.cx == null) { cam.cx = c.x; cam.cy = c.y; }
  worldScale = baseScale * cam.zoom;
  // Keep the table on screen: the view centre may not leave the table.
  const halfW = canvasW / 2 / worldScale, halfH = canvasH / 2 / worldScale;
  cam.cx = sz.w / 2 <= halfW ? c.x : clamp(cam.cx, halfW - 8, sz.w - halfW + 8);
  cam.cy = sz.h / 2 <= halfH ? c.y : clamp(cam.cy, halfH - 8, sz.h - halfH + 8);
  worldOffX = canvasW / 2 - cam.cx * worldScale;
  worldOffY = canvasH / 2 - cam.cy * worldScale;
}

function camReset() { cam.zoom = 1; cam.cx = null; cam.cy = null; applyCamera(); }
function camZoomAt(sx, sy, factor) {
  const before = s2w(sx, sy);
  cam.zoom = clamp(cam.zoom * factor, 1, 6);
  applyCamera();
  const after = s2w(sx, sy);
  cam.cx += before.x - after.x; cam.cy += before.y - after.y;
  applyCamera();
}
function camPan(dxPx, dyPx) { cam.cx -= dxPx / worldScale; cam.cy -= dyPx / worldScale; applyCamera(); }
/** Frame a table point and a zoom (used to open online games near your fleet). */
function camLookAt(x, y, zoom) { cam.zoom = zoom; cam.cx = x; cam.cy = y; applyCamera(); }

function w2s(wx, wy) { return { x: worldOffX + wx * worldScale, y: worldOffY + wy * worldScale }; }
function w2r(r) { return r * worldScale; }
function s2w(sx, sy) { return { x: (sx - worldOffX) / worldScale, y: (sy - worldOffY) / worldScale }; }

// ─── View hooks ───────────────────────────────────────
// The 3D table (view3d.js) replaces these. Seen from straight above they
// are trivial: height does not show, and a direction on the table is the
// same direction on screen.
function w2s3(wx, wy, h) { return w2s(wx, wy); }
/** Unit screen direction of table direction (dx, dy) at table point (x, y). */
function sdir(x, y, dx, dy) { const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; }
/** Open a game: the whole table, or on a big round table your own side of it. */
function camHome() {
  camReset();
  if (isOnline() && NET.seat != null && G.table.shape === 'circle' && G.table.r > 70) {
    const home = seatHome(NET.seat), c = tableCenter();
    camLookAt(c.x + (home.x - c.x) * 0.45, c.y + (home.y - c.y) * 0.45, clamp(G.table.r / 60, 1, 2.2));
  }
}
function camCanOrbit() { return false; }
function camOrbit(dx, dy) {}
function camRotate(rad) {}
// The camera moving between ships: nothing to do when the whole table is in view.
function camFocusShip(ship, force) {}
function camFollowShip(ship) {}
function camTurnStart(p) {}
function camNextShip() {}
/** A shot was fired from (origin); the 3D view moves the ship's gun to that slot. */
function noteShot(ship, origin, h) {}
/** Screen position of the heading handle while steering. */
function moveHandleScreen(m) {
  const c = w2s(m.ship.x, m.ship.y), f = fwdVec(m.plan.rot.h), R = w2r(m.ship.len * 1.1);
  return { x: c.x + f.x * R, y: c.y + f.y * R };
}
/** Screen position of the aiming handle for the turret or an island gun, and its circle's pivot. */
function aimHandleScreen(F) {
  const p = aimPivot(F), c = w2s(p.x, p.y), f = fwdVec(F.h), R = Math.max(34, w2r(9));
  return { x: c.x + f.x * R, y: c.y + f.y * R, cx: c.x, cy: c.y, R };
}

function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

// ─── Frame ────────────────────────────────────────────

function drawFrame() {
  applyCamera();
  ctx.clearRect(0, 0, canvasW, canvasH);
  drawTable();
  if (!G) return;
  drawSetupOverlay();
  drawTerrain();
  drawMovePreview();
  drawEvasivePreview();
  drawShips();
  drawFirePreview();
  drawAnimations(ctx);
  drawControls();
}

// ─── On-canvas controls (ring menu and chips) ─────────

const ICON_IMG = {};
function coinImage(src) {
  if (!ICON_IMG[src]) { const im = new Image(); im.src = src; ICON_IMG[src] = im; }
  return ICON_IMG[src];
}

/** Small line icons in the rulebook's ink, drawn at (x, y) in a 16 px box. */
function drawIcon(kind, x, y, col) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  switch (kind) {
    case 'steer': ctx.arc(0, 1, 7, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); ctx.beginPath(); ctx.moveTo(5, -6); ctx.lineTo(6.5, -2.2); ctx.lineTo(2.5, -2.5); ctx.stroke(); break;
    case 'sail': case 'click': ctx.moveTo(0, 7); ctx.lineTo(0, -7); ctx.moveTo(-5, -2); ctx.lineTo(0, -7); ctx.lineTo(5, -2); ctx.stroke(); break;
    case 'fire': case 'islandgun':
      ctx.arc(-2, 2, 4.5, 0, TAU); ctx.fill();
      for (const a of [-0.9, -0.3, 0.3]) { ctx.beginPath(); ctx.moveTo(3 + Math.cos(a) * 3, -2 + Math.sin(a) * 3); ctx.lineTo(3 + Math.cos(a) * 7, -2 + Math.sin(a) * 7); ctx.stroke(); }
      if (kind === 'islandgun') { ctx.beginPath(); ctx.moveTo(-8, 8); ctx.lineTo(8, 8); ctx.stroke(); }
      break;
    case 'raise': ctx.moveTo(-4, 8); ctx.lineTo(-4, -8); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(7, -4.5); ctx.lineTo(-4, -1); ctx.closePath(); ctx.fill(); break;
    case 'collect': ctx.arc(0, 0, 7, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, TAU); ctx.fill(); break;
    case 'pass': ctx.moveTo(-6, 0); ctx.lineTo(-1.5, 5); ctx.lineTo(7, -5); ctx.stroke(); break;
    case 'scuttle': ctx.moveTo(-6, -6); ctx.lineTo(6, 6); ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke(); break;
    case 'arrow': ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(2, -5); ctx.lineTo(7, 0); ctx.lineTo(2, 5); ctx.stroke(); break;
    default: ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawChip(it, opts) {
  const hot = opts.hot, r = it.r * (hot ? 1.08 : 1);
  ctx.save();
  ctx.globalAlpha = it.disabled ? 0.5 : 1;
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.arc(it.x + 1.5, it.y + 2.5, r, 0, TAU); ctx.fill();
  ctx.fillStyle = opts.fill || '#fbf4e3';
  ctx.strokeStyle = hot ? '#8b1a1a' : '#6b4c30'; ctx.lineWidth = hot ? 3 : 1.5;
  ctx.beginPath(); ctx.arc(it.x, it.y, r, 0, TAU); ctx.fill(); ctx.stroke();
  if (opts.img) {
    const im = coinImage(opts.img);
    if (im.complete && im.naturalWidth) ctx.drawImage(im, it.x - r * 0.8, it.y - r * 0.8, r * 1.6, r * 1.6);
  } else if (opts.text) {
    ctx.fillStyle = '#3c2415'; ctx.font = `bold ${Math.round(r * 0.95)}px "Crimson Text",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(opts.text, it.x, it.y + 1);
  } else {
    if (opts.rot != null) { ctx.translate(it.x, it.y); ctx.rotate(opts.rot); drawIcon(opts.icon, 0, 0, opts.ink || '#3c2415'); }
    else drawIcon(opts.icon, it.x, it.y, opts.ink || '#3c2415');
  }
  ctx.restore();
  if (opts.label) {
    ctx.font = 'bold 12px "Crimson Text",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,6,.85)'; ctx.strokeText(opts.label, it.x, it.y + r + 2);
    ctx.fillStyle = '#faf3e0'; ctx.fillText(opts.label, it.x, it.y + r + 2);
  }
}

function drawControls() {
  if (!G || G.phase !== 'play') return;
  const ring = ringLayout();
  if (ring.length) {
    const c = { x: ring[0].cx, y: ring[0].cy };
    ctx.strokeStyle = 'rgba(250,243,224,.35)'; ctx.lineWidth = 1;
    for (const it of ring) { ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(it.x, it.y); ctx.stroke(); }
    for (const it of ring) {
      const fire = it.id === 'fire' || it.id === 'islandgun';
      drawChip(it, { hot: UI.hoverRing === it.id, img: it.img, icon: it.icon, label: it.label, fill: fire ? '#f3d9cf' : null, ink: fire ? '#8b1a1a' : null });
    }
  }
  const m = UI.move;
  for (const ch of moveChipLayout()) {
    const hot = m.hoverK === ch.k;
    drawChip(ch, { hot, text: String(ch.k), label: ch.k === m.ship.moveCount && !hot ? 'Sail' : hot ? `Sail ${ch.k}` : '' });
  }
  const F = UI.fire;
  for (const ch of slotChipLayout()) {
    ctx.strokeStyle = 'rgba(250,243,224,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ch.slot.x, ch.slot.y); ctx.lineTo(ch.x, ch.y); ctx.stroke();
    drawChip(ch, { hot: F.hover === ch.idx, icon: 'fire', ink: '#8b1a1a', label: ch.label });
  }
  for (const ch of evasiveChipLayout()) {
    drawChip(ch, { hot: UI.evasive.hover === ch.side, icon: 'arrow', rot: Math.atan2(ch.dir.y, ch.dir.x), label: ch.label });
  }
}

function drawRoundTable() {
  const c = tableCenter(), R = G.table.r;
  const s = w2s(c.x, c.y), rr = w2r(R);
  ctx.fillStyle = '#4a3020';
  ctx.beginPath(); ctx.arc(s.x, s.y, rr + 7, 0, TAU); ctx.fill();
  const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, rr);
  grad.addColorStop(0, '#1d5a80'); grad.addColorStop(1, '#0f3350');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.fill();
  ctx.save();
  ctx.beginPath(); ctx.arc(s.x, s.y, rr, 0, TAU); ctx.clip();
  ctx.strokeStyle = 'rgba(140,200,240,.07)'; ctx.lineWidth = 1;
  const step = Math.max(10, 14 * worldScale / 3);
  for (let y = s.y - rr; y < s.y + rr; y += step) {
    ctx.beginPath();
    for (let x = s.x - rr; x < s.x + rr; x += 4) {
      const wy = y + Math.sin(x * 0.03 + wavePhase * 0.8 + y * 0.01) * 2;
      x === s.x - rr ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(200,225,245,.05)';
  for (let k = 1; k * 12 * INCH < R; k++) { ctx.beginPath(); ctx.arc(s.x, s.y, w2r(k * 12 * INCH), 0, TAU); ctx.stroke(); }
  ctx.restore();
  if (G.phase === 'play' || G.phase === 'over') {
    // Each seat's stretch of rim in its colour; the active one glows.
    for (const p of G.order) {
      const home = seatHome(p), span = 0.42 * TAU / G.order.length;
      const on = p === G.active && G.phase === 'play';
      ctx.strokeStyle = rgba(colorOf(p).rgb, on ? 0.75 + Math.sin(wavePhase * 3) * 0.15 : 0.35);
      ctx.lineWidth = on ? 6 : 3;
      ctx.beginPath(); ctx.arc(s.x, s.y, rr + 3.5, home.a - span, home.a + span); ctx.stroke();
    }
  }
}

function drawTable() {
  // Wooden table edge around the play area.
  ctx.fillStyle = '#2b2018';
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (G && G.table.shape === 'circle') { drawRoundTable(); return; }
  const a = w2s(0, 0), b = w2s(G ? G.table.w : RECT_TABLE, G ? G.table.h : RECT_TABLE);
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(a.x - 6, a.y - 6, b.x - a.x + 12, b.y - a.y + 12);
  const grad = ctx.createRadialGradient((a.x + b.x) / 2, (a.y + b.y) / 2, 0, (a.x + b.x) / 2, (a.y + b.y) / 2, (b.x - a.x) * 0.75);
  grad.addColorStop(0, '#1d5a80');
  grad.addColorStop(1, '#0f3350');
  ctx.fillStyle = grad;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);

  ctx.save();
  ctx.beginPath(); ctx.rect(a.x, a.y, b.x - a.x, b.y - a.y); ctx.clip();
  ctx.strokeStyle = 'rgba(140,200,240,.07)';
  ctx.lineWidth = 1;
  const step = Math.max(10, 14 * worldScale / 3);
  for (let y = a.y; y < b.y; y += step) {
    ctx.beginPath();
    for (let x = a.x; x < b.x; x += 4) {
      const wy = y + Math.sin(x * 0.03 + wavePhase * 0.8 + y * 0.01) * 2;
      x === a.x ? ctx.moveTo(x, wy) : ctx.lineTo(x, wy);
    }
    ctx.stroke();
  }
  // One-foot grid, faint.
  ctx.strokeStyle = 'rgba(200,225,245,.05)';
  for (let f = 1; f < 4; f++) {
    const p = w2s(f * 12 * INCH, f * 12 * INCH);
    ctx.beginPath(); ctx.moveTo(p.x, a.y); ctx.lineTo(p.x, b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.x, p.y); ctx.lineTo(b.x, p.y); ctx.stroke();
  }
  ctx.restore();

  if (G && G.phase === 'play') {
    // Glow on the active player's home edge.
    const p = G.active, c = colorOf(p).rgb;
    const y = p === 1 ? b.y : a.y;
    const g2 = ctx.createLinearGradient(0, y - 8, 0, y + 8);
    g2.addColorStop(0, rgba(c, 0)); g2.addColorStop(0.5, rgba(c, 0.55)); g2.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g2;
    ctx.fillRect(a.x, y - 8, b.x - a.x, 16);
  }
}

function drawSetupOverlay() {
  if (G.table.shape === 'circle') return;
  const a = w2s(0, 0), b = w2s(G.table.w, G.table.h);
  if (G.phase === 'islands') {
    const m = w2r(ISLAND_EDGE_MIN);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(a.x, a.y, b.x - a.x, m);
    ctx.fillRect(a.x, b.y - m, b.x - a.x, m);
    ctx.fillRect(a.x, a.y + m, m, b.y - a.y - 2 * m);
    ctx.fillRect(b.x - m, a.y + m, m, b.y - a.y - 2 * m);
    ctx.strokeStyle = 'rgba(212,168,83,.35)'; ctx.setLineDash([6, 6]);
    ctx.strokeRect(a.x + m, a.y + m, b.x - a.x - 2 * m, b.y - a.y - 2 * m);
    ctx.setLineDash([]);
  }
  if (G.phase === 'terrain') {
    const m = w2r(DEPLOY_STRIP);
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(a.x, a.y, b.x - a.x, m);
    ctx.fillRect(a.x, b.y - m, b.x - a.x, m);
  }
  if (G.phase === 'deploy') {
    const c = colorOf(G.active).rgb, m = w2r(15);
    ctx.fillStyle = rgba(c, 0.12 + Math.sin(wavePhase * 3) * 0.04);
    if (G.active === 1) ctx.fillRect(a.x, b.y - m, b.x - a.x, m); else ctx.fillRect(a.x, a.y, b.x - a.x, m);
  }
  const gh = UI.ghost;
  if (gh && (G.phase === 'islands' || G.phase === 'terrain')) {
    drawTerrainPiece({ type: gh.type, x: gh.x, y: gh.y, r: gh.r, owner: null }, 0.55);
    const s = w2s(gh.x, gh.y);
    ctx.strokeStyle = gh.ok ? 'rgba(80,220,120,.9)' : 'rgba(240,80,60,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, w2r(gh.r) + 3, 0, TAU); ctx.stroke();
  }
  if (gh && G.phase === 'deploy' && gh.ship) {
    drawShipBody(gh.ship, gh.pose, 0.5, true);
    const s = w2s(gh.pose.x, gh.pose.y);
    ctx.strokeStyle = gh.ok ? 'rgba(80,220,120,.9)' : 'rgba(240,80,60,.9)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(s.x, s.y, w2r(gh.ship.len * 0.6), 0, TAU); ctx.stroke();
  }
}

// ─── Terrain ──────────────────────────────────────────

function drawTerrain() {
  for (const t of G.terrain) drawTerrainPiece(t, 1);
}

function drawTerrainPiece(t, alpha) {
  const s = w2s(t.x, t.y), r = w2r(t.r);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.arc(s.x + 2, s.y + 3, r, 0, TAU); ctx.fill();
  if (t.type === 'island') {
    ctx.fillStyle = '#d7b878';
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4c8a44';
    ctx.beginPath(); ctx.arc(s.x, s.y, r * 0.72, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3b7036';
    ctx.beginPath(); ctx.arc(s.x - r * 0.3, s.y - r * 0.2, r * 0.22, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(s.x + r * 0.25, s.y + r * 0.2, r * 0.18, 0, TAU); ctx.fill();
    // Topper cannon slots.
    ctx.fillStyle = '#3a2a1a';
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + 0.3;
      ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * r * 0.86, s.y + Math.sin(a) * r * 0.86, Math.max(1.2, r * 0.07), 0, TAU); ctx.fill();
    }
    if (t.owner) {
      const col = colorOf(t.owner);
      const wave = Math.sin(wavePhase * 4 + t.id) * 2;
      const poleTop = s.y - r * 0.2 - Math.max(16, r * 0.9);
      ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, poleTop); ctx.stroke();
      ctx.fillStyle = col.main;
      ctx.beginPath();
      ctx.moveTo(s.x, poleTop);
      ctx.quadraticCurveTo(s.x + 8, poleTop + 2 + wave, s.x + 15, poleTop + 5);
      ctx.lineTo(s.x, poleTop + 10);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = col.main; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(s.x, s.y, r + 2, 0, TAU); ctx.stroke();
    }
  } else if (t.type === 'rock') {
    ctx.fillStyle = '#5d5d5d';
    ctx.beginPath();
    for (let i = 0; i < 9; i++) {
      const a = i * TAU / 9, rr = r * (0.85 + 0.15 * Math.sin(i * 2.7 + t.x));
      i ? ctx.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr) : ctx.moveTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7a7a7a';
    ctx.beginPath(); ctx.arc(s.x - r * 0.25, s.y - r * 0.25, r * 0.4, 0, TAU); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(190,120,95,.85)';
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,170,140,.9)';
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4 + t.y, rr = r * 0.55 * ((i % 3) / 3 + 0.3);
      ctx.beginPath(); ctx.arc(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr, Math.max(1.2, r * 0.16), 0, TAU); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,220,200,.5)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  ctx.restore();
}

// ─── Ships ────────────────────────────────────────────

function drawShips() {
  for (const p of G.order) for (const s of G.players[p].ships) if (s.placed) drawShip(s);
}

function drawShip(ship) {
  const mine = G.phase === 'play' && ship.owner === G.active;
  const spent = mine && ship.acted && !ship.pending;
  drawShipBody(ship, ship, spent ? 0.55 : 1, false);
  const c = w2s(ship.x, ship.y);
  const R = w2r(ship.len * 0.62);
  if (UI.signalPick === ship || UI.hoverShip === ship) {
    ctx.strokeStyle = UI.signalPick === ship ? 'rgba(139,26,26,.95)' : 'rgba(255,215,110,.7)';
    ctx.lineWidth = UI.signalPick === ship ? 3.5 : 2.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, R + 3, 0, TAU); ctx.stroke();
  }
  if (UI.sel === ship) {
    ctx.strokeStyle = `rgba(255,215,110,${0.55 + Math.sin(wavePhase * 5) * 0.35})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
  } else if (UI.targets && UI.targets.includes(ship)) {
    ctx.strokeStyle = `rgba(90,230,140,${0.5 + Math.sin(wavePhase * 5) * 0.3})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
    ctx.setLineDash([]);
  } else if (mine && !ship.acted && isMyTurn()) {
    ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke();
  }
  if (ship.braced) {
    ctx.strokeStyle = `rgba(241,196,15,${0.45 + Math.sin(wavePhase * 4) * 0.2})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(c.x, c.y, R + 4, 0, TAU); ctx.stroke();
  }
  if (passiveOf(ship.owner) === 'stone' && !ship.stoneUsed) {
    ctx.strokeStyle = 'rgba(200,190,160,.35)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(c.x, c.y, R + 1, 0, TAU); ctx.stroke();
  }
  // Badges: Skilled Gunner, extra turns from Signal Flags, gave its action away.
  const badge = (ship.gunner ? COIN_DEFS.gunner.icon : '') + (ship.turnsLeft > 1 && !ship.acted ? ` x${ship.turnsLeft}` : '') + (ship.noAction && !ship.acted ? ' ' + COIN_DEFS.signal.icon : '');
  if (badge) {
    ctx.font = `bold ${Math.round(clamp(worldScale * 3, 11, 16))}px "Crimson Text",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.6)';
    ctx.strokeText(badge, c.x + R * 0.8, c.y - R * 0.8);
    ctx.fillStyle = '#faf3e0';
    ctx.fillText(badge, c.x + R * 0.8, c.y - R * 0.8);
  }
  if (worldScale > 2.6) {
    ctx.font = `${Math.round(clamp(worldScale * 2.2, 8, 13))}px "Crimson Text",serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillText(ship.name, c.x + 1, c.y + R * 0.78 + 1);
    ctx.fillStyle = isDead(ship) ? 'rgba(255,170,150,.9)' : 'rgba(235,235,225,.85)';
    ctx.fillText(isDead(ship) ? ship.name + ' (dead)' : ship.name, c.x, c.y + R * 0.78);
  }
}

function hullPath(style, L, W) {
  ctx.beginPath();
  const hl = L / 2, hw = W / 2;
  if (style === 'barge') {
    ctx.moveTo(-hw * 0.7, -hl); ctx.lineTo(hw * 0.7, -hl);
    ctx.lineTo(hw, -hl * 0.7); ctx.lineTo(hw, hl); ctx.lineTo(-hw, hl); ctx.lineTo(-hw, -hl * 0.7);
  } else if (style === 'steam') {
    ctx.moveTo(0, -hl); ctx.lineTo(hw, -hl * 0.45); ctx.lineTo(hw, hl * 0.9);
    ctx.lineTo(hw * 0.7, hl); ctx.lineTo(-hw * 0.7, hl); ctx.lineTo(-hw, hl * 0.9); ctx.lineTo(-hw, -hl * 0.45);
  } else if (style === 'junk') {
    ctx.moveTo(-hw * 0.5, -hl); ctx.quadraticCurveTo(0, -hl * 1.05, hw * 0.5, -hl);
    ctx.quadraticCurveTo(hw * 1.1, -hl * 0.2, hw, hl * 0.8); ctx.lineTo(hw * 0.8, hl);
    ctx.lineTo(-hw * 0.8, hl); ctx.lineTo(-hw, hl * 0.8); ctx.quadraticCurveTo(-hw * 1.1, -hl * 0.2, -hw * 0.5, -hl);
  } else {
    ctx.moveTo(0, -hl);
    ctx.quadraticCurveTo(hw * 1.15, -hl * 0.45, hw, hl * 0.35);
    ctx.lineTo(hw * 0.8, hl); ctx.lineTo(-hw * 0.8, hl); ctx.lineTo(-hw, hl * 0.35);
    ctx.quadraticCurveTo(-hw * 1.15, -hl * 0.45, 0, -hl);
  }
  ctx.closePath();
}

function drawShipBody(ship, pose, alpha, ghost) {
  const c = w2s(pose.x, pose.y);
  const L = w2r(ship.len), W = w2r(ship.wid);
  const col = colorOf(ship.owner);
  const hullC = FACTION_DEFS[ship.build].hullColor;
  const dead = isDead(ship);
  ctx.save();
  ctx.translate(c.x, c.y);
  ctx.rotate(pose.h);
  ctx.globalAlpha = alpha;

  if (!ghost) {
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.save(); ctx.translate(2, 3);
    if (ship.hullStyle === 'cat') { ctx.fillRect(-W / 2, -L / 2, W, L); } else { hullPath(ship.hullStyle, L, W); ctx.fill(); }
    ctx.restore();
  }
  const fill = dead ? rgba(hullC.map(v => v * 0.55), 1) : rgba(hullC, 1);
  if (ship.hullStyle === 'cat') {
    const pw = W * 0.3;
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(sx * (W / 2 - pw / 2), 0, pw / 2, L / 2, 0, 0, TAU);
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = col.main; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.fillStyle = rgba([150, 110, 70], 1);
    ctx.fillRect(-W / 2 + pw / 2, -L * 0.2, W - pw, L * 0.1);
    ctx.fillRect(-W / 2 + pw / 2, L * 0.12, W - pw, L * 0.1);
  } else {
    hullPath(ship.hullStyle, L, W);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = ghost ? 'rgba(255,255,255,.8)' : col.main;
    ctx.lineWidth = Math.max(1.5, W * 0.12);
    ctx.stroke();
    // Deck
    ctx.fillStyle = dead ? 'rgba(60,40,25,.8)' : 'rgba(150,105,60,.85)';
    ctx.beginPath();
    ctx.moveTo(0, -L * 0.36);
    ctx.quadraticCurveTo(W * 0.35, -L * 0.1, W * 0.3, L * 0.42);
    ctx.lineTo(-W * 0.3, L * 0.42);
    ctx.quadraticCurveTo(-W * 0.35, -L * 0.1, 0, -L * 0.36);
    ctx.closePath(); ctx.fill();
  }

  // Cannon slots, each with a short barrel showing which way it fires.
  if (!ghost) {
    ctx.fillStyle = '#111'; ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, W * 0.08);
    for (const sl of shipSlots(ship)) {
      if (sl.free) continue;
      const cx = sl.lx * worldScale * 0.92, cy = -sl.ly * worldScale * 0.97;
      const dx = Math.sin(sl.dir), dy = -Math.cos(sl.dir), bl = Math.max(2.5, W * 0.28);
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, W * 0.1), 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + dx * bl, cy + dy * bl); ctx.stroke();
    }
  }

  // Fittings from the ship's mask: masts round, cargo square, and the
  // Industry turret amidships at its current facing.
  const layout = fittingLayout(ship), mask = fitMaskOf(ship);
  const fr = Math.max(1.6, W * 0.2);
  layout.forEach((f, i) => {
    const cy = -f.ly * worldScale;
    if (f.kind === 'turret') {
      if (!mask[i]) {
        if (!ghost) { ctx.strokeStyle = 'rgba(30,20,10,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, cy, fr * 1.2, 0, TAU); ctx.stroke(); }
        return;
      }
      ctx.fillStyle = '#3a3a44'; ctx.strokeStyle = col.light; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, cy, fr * 1.4, 0, TAU); ctx.fill(); ctx.stroke();
      const aiming = UI.fire && UI.fire.ship && UI.fire.ship.id === ship.id && UI.fire.slot && UI.fire.slot.free;
      const th = aiming ? UI.fire.h - pose.h : (ship.turretRel || 0);
      ctx.save(); ctx.translate(0, cy); ctx.rotate(th);
      ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.5, fr * 0.6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -fr * 2.6); ctx.stroke();
      ctx.restore();
      return;
    }
    if (mask[i]) {
      ctx.fillStyle = col.light; ctx.strokeStyle = 'rgba(40,25,10,.8)'; ctx.lineWidth = 1;
      ctx.beginPath();
      if (f.kind === 'stack') { ctx.fillStyle = '#26262c'; ctx.rect(-fr * 0.7, cy - fr * 1.1, fr * 1.4, fr * 2.2); }
      else if (f.kind === 'cargo') ctx.rect(-fr * 0.85, cy - fr * 0.85, fr * 1.7, fr * 1.7);
      else ctx.arc(0, cy, fr, 0, TAU);
      ctx.fill(); ctx.stroke();
    } else if (!ghost) {
      ctx.strokeStyle = 'rgba(30,20,10,.7)'; ctx.lineWidth = 1.2;
      const x = fr * 0.6;
      ctx.beginPath(); ctx.moveTo(-x, cy - x); ctx.lineTo(x, cy + x); ctx.moveTo(x, cy - x); ctx.lineTo(-x, cy + x); ctx.stroke();
    }
  });
  ctx.restore();

  if (dead && !ghost) {
    ctx.strokeStyle = `rgba(160,210,240,${0.3 + Math.sin(wavePhase * 2 + pose.x) * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(c.x, c.y, L * 0.55 + Math.sin(wavePhase * 2) * 2, 0, TAU); ctx.stroke();
  }
}

// ─── Previews ─────────────────────────────────────────

function drawMovePreview() {
  const m = UI.move;
  if (UI.mode !== 'move' || !m || !m.plan) return;
  const ship = m.ship, plan = m.plan;
  const c = w2s(ship.x, ship.y);
  if (!m.lockHeading) {
    const piv = pivotFor(ship) * Math.PI / 180;
    const R = w2r(ship.len * 1.1);
    ctx.fillStyle = 'rgba(80,220,140,.10)';
    ctx.strokeStyle = 'rgba(80,220,140,.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (piv >= Math.PI - 1e-3) ctx.arc(c.x, c.y, R, 0, TAU);
    else { ctx.moveTo(c.x, c.y); ctx.arc(c.x, c.y, R, ship.h - piv - Math.PI / 2, ship.h + piv - Math.PI / 2); ctx.closePath(); }
    ctx.fill(); ctx.stroke();
    // Heading handle: drag it (or tap anywhere) to swing the bow.
    const hk = moveHandleScreen(m), kx = hk.x, ky = hk.y;
    ctx.strokeStyle = 'rgba(250,243,224,.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(kx, ky); ctx.stroke();
    // Open knob while previewing; solid crimson once the heading is set.
    ctx.fillStyle = m.locked ? '#8b1a1a' : '#faf3e0'; ctx.strokeStyle = m.locked ? '#faf3e0' : '#3c2415'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(kx, ky, m.locked ? 11 : 9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = m.locked ? '#faf3e0' : '#3c2415';
    ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill();
  }
  // Planned track with a tick per click.
  const f = fwdVec(plan.rot.h);
  const s0 = w2s(plan.start.x, plan.start.y);
  const full = w2s(plan.start.x + f.x * plan.planned, plan.start.y + f.y * plan.planned);
  const e = w2s(plan.end.x, plan.end.y);
  ctx.setLineDash([6, 5]);
  ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(full.x, full.y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(90,240,150,.9)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  for (let k = 1; k <= plan.clicks; k++) {
    const d = k * CLICK_LEN;
    const p = w2s(plan.start.x + f.x * d, plan.start.y + f.y * d);
    ctx.fillStyle = d <= plan.moved + 0.01 ? 'rgba(90,240,150,1)' : 'rgba(255,255,255,.3)';
    ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
  }
  drawShipBody(ship, plan.end, 0.45, true);
  if (plan.stoppedBy) {
    ctx.strokeStyle = 'rgba(255,110,80,.95)'; ctx.lineWidth = 2.5;
    const f2 = fwdVec(plan.rot.h);
    const bow = w2s(plan.end.x + f2.x * ship.len / 2, plan.end.y + f2.y * ship.len / 2);
    ctx.beginPath(); ctx.moveTo(bow.x - 5, bow.y - 5); ctx.lineTo(bow.x + 5, bow.y + 5); ctx.moveTo(bow.x + 5, bow.y - 5); ctx.lineTo(bow.x - 5, bow.y + 5); ctx.stroke();
  }
}

function drawEvasivePreview() {
  if (UI.mode !== 'evasive' || !UI.evasive) return;
  for (const side of ['port', 'stbd']) {
    const pl = UI.evasive[side];
    const on = UI.evasive.pick === side || UI.evasive.hover === side;
    drawShipBody(UI.evasive.ship, pl.end, UI.evasive.pick === side ? 0.85 : on ? 0.65 : 0.4, true);
    const s = w2s(pl.end.x, pl.end.y);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.font = 'bold 12px "Crimson Text",serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(side === 'port' ? 'P' : 'S', s.x, s.y);
  }
}

function drawLane(ox, oy, h, D, strong) {
  // Solid where the ball is low enough to touch a hull, faint where it flies over.
  const f = fwdVec(h), total = D * (1 + ROLL_K);
  let prevLow = null, segStart = 0;
  const flush = (a, b, low) => {
    const p1 = w2s(ox + f.x * a, oy + f.y * a), p2 = w2s(ox + f.x * b, oy + f.y * b);
    ctx.strokeStyle = low ? (strong ? 'rgba(255,90,70,.95)' : 'rgba(255,90,70,.55)') : 'rgba(255,200,180,.35)';
    ctx.lineWidth = low ? (strong ? 3 : 2) : 1.2;
    ctx.setLineDash(low ? [] : [4, 5]);
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    ctx.setLineDash([]);
  };
  for (let s = 0; s <= total; s += 0.5) {
    const low = ballHeight(s, D) < HULL_H;
    if (prevLow === null) prevLow = low;
    if (low !== prevLow) { flush(segStart, s, prevLow); segStart = s; prevLow = low; }
  }
  flush(segStart, total, prevLow);
  const land = w2s(ox + f.x * D, oy + f.y * D);
  ctx.strokeStyle = 'rgba(255,230,120,.95)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(land.x, land.y, Math.max(5, w2r(1.5)), 0, TAU); ctx.stroke();
}

function drawFirePreview() {
  const F = UI.fire;
  if (UI.mode !== 'fire' || !F) return;
  if (F.stage === 'slot') {
    F.slots.forEach((sl, i) => {
      const hot = F.hover === i;
      const w = slotWorld(F.ship, sl);
      const o = w2s(w.x, w.y);
      if (!sl.free) {
        const e = w2s(w.x + fwdVec(w.h).x * RANGE_MAX, w.y + fwdVec(w.h).y * RANGE_MAX);
        ctx.strokeStyle = hot ? 'rgba(255,120,90,.9)' : 'rgba(255,120,90,.35)'; ctx.lineWidth = hot ? 2.5 : 1.5; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(e.x, e.y); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(255,120,90,.35)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 6]);
        ctx.beginPath(); ctx.arc(o.x, o.y, w2r(RANGE_MAX * 0.5), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      }
      const r = Math.max(4, Math.min(w2r(0.9), 8)) * (hot ? 1.4 : 1);
      ctx.fillStyle = hot ? 'rgba(139,26,26,.95)' : 'rgba(230,185,90,.95)'; ctx.strokeStyle = 'rgba(20,10,5,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(o.x, o.y, r, 0, TAU); ctx.fill(); ctx.stroke();
    });
    return;
  }
  const o = fireOrigin(F);
  if (F.stage === 'dir') {
    drawLane(o.x, o.y, o.h, RANGE_MAX, false);
    // Aiming handle for the turret or island gun, like the heading handle.
    const hk = aimHandleScreen(F), c = { x: hk.cx, y: hk.cy }, R = hk.R, kx = hk.x, ky = hk.y;
    ctx.strokeStyle = 'rgba(250,243,224,.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = F.locked ? '#8b1a1a' : '#faf3e0'; ctx.strokeStyle = F.locked ? '#faf3e0' : '#8b1a1a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(kx, ky, F.locked ? 11 : 9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = F.locked ? '#faf3e0' : '#8b1a1a'; ctx.beginPath(); ctx.arc(kx, ky, 3, 0, TAU); ctx.fill();
    return;
  }
  if (F.stage === 'power') drawLane(o.x, o.y, o.h, powerToRange(currentPower()), true);
}
