// Cannons & Coastlines, digital edition: animations.js
// Animation queue. Positions are in table centimetres and converted at draw
// time, so a resize mid-animation does not break anything.

let animations = [];
let wavePhase = 0;
let lastTs = null;
let skipUntil = 0;
const REDUCED_MOTION = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// Playback rate: faster on the computer's turns, much faster while the
// player taps to skip, and quicker (with less shaking) for reduced motion.
function animRate() {
  let r = GAME_SPEED;
  if (REDUCED_MOTION) r *= 2.5;
  if (typeof G !== 'undefined' && G && G.phase === 'play' && !isMyTurn()) r *= 1.4;
  if (performance.now() < skipUntil) r *= 8;
  return r;
}
function skipAnimations() { skipUntil = performance.now() + 1500; }

function updateAnimations(ts) {
  wavePhase = ts * 0.001;
  const dt = lastTs == null ? 0 : Math.min(100, ts - lastTs);
  lastTs = ts;
  const rate = animRate();
  for (const a of animations) {
    a.elapsed = (a.elapsed || 0) + dt * rate;
    a.progress = Math.min(1, a.elapsed / a.duration);
    if (a.update) a.update(a.progress);
    if (a.progress >= 1 && !a.done) { a.done = true; if (a.onComplete) a.onComplete(); }
  }
  animations = animations.filter(a => !a.done);
}

function isAnimating() { return animations.some(a => a.blocking); }

function pushAnim(a) { animations.push(Object.assign({ progress: 0, elapsed: 0 }, a)); }

function tween(duration, update, blocking = true) {
  return new Promise(resolve => pushAnim({ type: 'tween', duration, update, blocking, onComplete: resolve }));
}

const ease = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Rotate then slide a ship along a planned move, one click at a time. */
async function animShipMove(ship, plan) {
  const h0 = ship.h;
  const dh = angleDiff(plan.rot.h, h0);
  if (Math.abs(dh) > 0.01) {
    sfxRudder();
    await tween(180 + Math.abs(dh) * 260, p => { ship.h = normAngle(h0 + dh * ease(p)); });
  }
  ship.h = plan.rot.h;
  const bump = !!plan.stoppedBy && plan.moved < plan.planned - 0.05;
  camFollowShip(ship);
  try { await animRoll(ship, plan.start, plan.end, bump); } finally { camFollowShip(null); }
}

/**
 * Roll forward one wheel click at a time: a short ease per click with a
 * click sound on each beat, then a small bump if the ship hit something.
 */
async function animRoll(ship, from, to, bump) {
  const len = dist(from.x, from.y, to.x, to.y);
  const ux = len > 1e-6 ? (to.x - from.x) / len : 0, uy = len > 1e-6 ? (to.y - from.y) / len : 0;
  let done = 0;
  while (done < len - 1e-4) {
    const seg = Math.min(CLICK_LEN, len - done), a = done;
    await tween(90 + 190 * seg / CLICK_LEN, p => {
      const d = a + seg * ease(p);
      ship.x = from.x + ux * d; ship.y = from.y + uy * d;
      if (Math.random() < 0.35) addWake(ship);
    });
    done += seg;
    if (seg > CLICK_LEN - 0.01) sfxDialClick();
  }
  ship.x = to.x; ship.y = to.y;
  if (bump) {
    sfxHitTerrain(); hapticTap();
    const f = fwdVec(ship.h);
    pushAnim({ type: 'bump', x: ship.x + f.x * ship.len / 2, y: ship.y + f.y * ship.len / 2, duration: 450 });
    if (!REDUCED_MOTION) {
      await tween(200, p => {
        const k = Math.sin(p * Math.PI) * 0.5 * (1 - p);
        ship.x = to.x - f.x * k; ship.y = to.y - f.y * k;
      });
    }
    ship.x = to.x; ship.y = to.y;
  }
}

/** Evasive slide: one smooth sideways shove. */
async function animSlide(ship, from, to) {
  if (dist(from.x, from.y, to.x, to.y) < 0.01) return;
  camFocusShip(ship);
  await tween(420, p => {
    const e = ease(p);
    ship.x = from.x + (to.x - from.x) * e; ship.y = from.y + (to.y - from.y) * e;
    if (Math.random() < 0.3) addWake(ship);
  });
  ship.x = to.x; ship.y = to.y;
}

function addWake(ship) {
  if (REDUCED_MOTION) return;
  const f = fwdVec(ship.h);
  pushAnim({ type: 'wake', x: ship.x - f.x * ship.len * 0.5, y: ship.y - f.y * ship.len * 0.5, duration: 900 });
}

/**
 * Cannonball from (ox, oy) along the path of `shot` (see shotPath),
 * stopping at contact distance `stopS`. Resolves when the ball stops.
 */
function animCannonball(ox, oy, shot, stopS) {
  sfxWhistle();
  const path = shotPath(ox, oy, shot);
  return new Promise(resolve => pushAnim({
    type: 'ball', ox, oy, path, land: path.legs[0].s1, stopS, blocking: true,
    duration: 250 + stopS * 16, onComplete: resolve,
  }));
}

function animSplash(x, y)     { pushAnim({ type: 'splash', x, y, duration: 700 }); sfxSplash(); }
function animHitFlash(x, y)   { pushAnim({ type: 'hit', x, y, duration: 450 }); sfxHitShip(); hapticDouble(); }
function animThud(x, y)       { pushAnim({ type: 'thud', x, y, duration: 450 }); sfxHitTerrain(); }
function animSparkle(x, y)    { pushAnim({ type: 'sparkle', x, y, duration: 800 }); }
function animSinking(x, y)    { pushAnim({ type: 'sinking', x, y, duration: 1600 }); sfxSunk(); hapticRumble(); }
function animRing(x, y, col)  { pushAnim({ type: 'ring', x, y, col: col || '241,196,15', duration: 900 }); }
function animFlagRaise(x, y, col) { pushAnim({ type: 'flag', x, y, col, duration: 1000 }); sfxFlag(); }
function animBoarding(x1, y1, x2, y2) { pushAnim({ type: 'boarding', x1, y1, x2, y2, duration: 800 }); sfxBoard(); }
function animText(x, y, text, col) { pushAnim({ type: 'text', x, y, text, col: col || '255,120,90', duration: 1300 }); }
/** Muzzle flash and a puff of smoke drifting out along the shot. */
function animSmoke(x, y, h) {
  pushAnim({ type: 'smoke', x, y, h, duration: 1000 });
}

/**
 * The lost fitting (mast or cargo) topples off the hull into the water,
 * floats a moment and sinks. `idx` is the fitting's slot along the keel.
 */
function animFittingFall(ship, idx) {
  if (idx == null || idx < 0 || idx >= ship.maxFit) return;
  const w = fittingWorld(ship, idx);
  const s = stbVec(ship.h);
  const side = Math.random() < 0.5 ? -1 : 1;
  // role: which piece of the 3D model this is (the nth mast or cargo from the bow).
  const layout = fittingLayout(ship), role = w.kind === 'mast' || w.kind === 'cargo'
    ? `${w.kind}:${layout.slice(0, idx).filter(f => f.kind === w.kind).length}` : w.kind;
  pushAnim({ type: 'fitting', x: w.x, y: w.y, dx: s.x * side, dy: s.y * side, kind: w.kind, mast: w.kind === 'mast', shipW: ship.wid, shipId: ship.id, role, duration: 1200 });
}

/** The hull settles, shrinks and goes under. */
function animWreck(ship) {
  const snap = Object.assign({}, ship, { fit: 0, placed: true });
  pushAnim({ type: 'wreck', ship: snap, pose: { x: ship.x, y: ship.y, h: ship.h }, tilt: (Math.random() - 0.5) * 0.6, duration: 1200 });
  animSinking(ship.x, ship.y);
}
function animRicochet(x, y, h) {
  const turn = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.9);
  pushAnim({ type: 'ricochet', x, y, h: normAngle(h + Math.PI + turn), duration: 500 });
}

// ─── Drawing ──────────────────────────────────────────

function drawAnimations(ctx) {
  for (const a of animations) {
    const p = a.progress || 0;
    switch (a.type) {
      case 'ball': {
        const s = a.stopS * p;
        const at = pathAt(a.path, s), gx = at.x, gy = at.y, hgt = at.z;
        const g = w2s(gx, gy);
        const lift = w2r(hgt) * 0.8;
        const br = Math.max(2.2, w2r(BALL_R) * (1 + hgt * 0.07));
        ctx.fillStyle = `rgba(0,0,0,${0.28 - Math.min(0.18, hgt * 0.02)})`;
        ctx.beginPath(); ctx.ellipse(g.x, g.y, br * 1.2, br * 0.7, 0, 0, TAU); ctx.fill();
        const grad = ctx.createRadialGradient(g.x - br * 0.3, g.y - lift - br * 0.3, 0, g.x, g.y - lift, br);
        grad.addColorStop(0, '#666'); grad.addColorStop(0.6, '#1a1a1a'); grad.addColorStop(1, '#000');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(g.x, g.y - lift, br, 0, TAU); ctx.fill();
        if (p < 0.12) {
          const o = w2s(a.ox, a.oy);
          ctx.fillStyle = `rgba(255,150,50,${0.6 * (1 - p / 0.12)})`;
          ctx.beginPath(); ctx.arc(o.x, o.y, br * 3, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(200,200,200,${0.35 * (1 - p / 0.12)})`;
          ctx.beginPath(); ctx.arc(o.x, o.y, br * 5 * (0.5 + p * 4), 0, TAU); ctx.fill();
        }
        break;
      }
      case 'ricochet': {
        const f = fwdVec(a.h);
        const s = 4 * p;
        const g = w2s(a.x + f.x * s, a.y + f.y * s);
        ctx.fillStyle = `rgba(20,20,20,${1 - p})`;
        ctx.beginPath(); ctx.arc(g.x, g.y - Math.sin(p * Math.PI) * 6, Math.max(2, w2r(BALL_R)), 0, TAU); ctx.fill();
        break;
      }
      case 'wake': {
        const g = w2s(a.x, a.y);
        ctx.strokeStyle = `rgba(200,230,255,${0.35 * (1 - p)})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(g.x, g.y, 2 + p * w2r(2.5), 0, TAU); ctx.stroke();
        break;
      }
      case 'splash': {
        const g = w2s(a.x, a.y), r = w2r(3) * p + 3;
        ctx.strokeStyle = `rgba(150,210,255,${1 - p})`; ctx.lineWidth = 2.5 - p * 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(220,240,255,${0.6 - p * 0.6})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(g.x, g.y, r * 0.5, 0, TAU); ctx.stroke();
        break;
      }
      case 'hit': {
        const g = w2s(a.x, a.y), r = Math.max(8, w2r(2.5));
        ctx.fillStyle = `rgba(255,140,0,${(1 - p) * 0.85})`;
        ctx.beginPath(); ctx.arc(g.x, g.y, r * (1 + p * 0.6), 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,255,200,${(1 - p) * 0.6})`;
        ctx.beginPath(); ctx.arc(g.x, g.y, r * 0.4, 0, TAU); ctx.fill();
        break;
      }
      case 'thud': {
        const g = w2s(a.x, a.y);
        ctx.fillStyle = `rgba(170,150,110,${(1 - p) * 0.7})`;
        ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(6, w2r(1.5)) * (1 + p), 0, TAU); ctx.fill();
        break;
      }
      case 'sparkle': {
        const g = w2s(a.x, a.y);
        for (let i = 0; i < 8; i++) {
          const ang = i * TAU / 8 + p * 3, r = 6 + p * 18;
          ctx.fillStyle = `rgba(255,220,120,${(1 - p) * 0.9})`;
          ctx.beginPath(); ctx.arc(g.x + Math.cos(ang) * r, g.y + Math.sin(ang) * r, 2.5 - p * 1.5, 0, TAU); ctx.fill();
        }
        break;
      }
      case 'sinking': {
        const g = w2s(a.x, a.y), r = w2r(4) + p * w2r(3);
        ctx.fillStyle = `rgba(5,20,40,${(1 - p) * 0.5})`;
        ctx.beginPath(); ctx.arc(g.x, g.y, r, 0, TAU); ctx.fill();
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = `rgba(170,210,240,${Math.max(0, 0.8 - p) * 0.6})`;
          ctx.beginPath();
          ctx.arc(g.x + Math.sin(p * 9 + i * 2) * r * 0.6, g.y - p * 18 + Math.cos(p * 7 + i * 3) * 4, 1.5 + i * 0.4, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'ring': {
        const g = w2s(a.x, a.y);
        ctx.strokeStyle = `rgba(${a.col},${Math.sin(p * Math.PI) * 0.9})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(g.x, g.y, w2r(5) + p * 8, 0, TAU); ctx.stroke();
        break;
      }
      case 'flag': {
        const g = w2s(a.x, a.y);
        const rise = Math.min(1, p * 2);
        ctx.strokeStyle = `rgba(${a.col},${1 - Math.max(0, p - 0.6) * 2.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(g.x, g.y, 10 + p * 30, 0, TAU); ctx.stroke();
        ctx.fillStyle = `rgba(${a.col},${1 - p})`;
        ctx.fillRect(g.x - 3, g.y - 20 - rise * 12, 12, 7);
        break;
      }
      case 'boarding': {
        const q = Math.min(1, p * 1.6);
        const a1 = w2s(a.x1, a.y1), a2 = w2s(a.x2, a.y2);
        ctx.fillStyle = `rgba(255,210,80,${p < 0.6 ? 1 : (1 - p) * 2.5})`;
        ctx.font = '18px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('⚔', a1.x + (a2.x - a1.x) * q, a1.y + (a2.y - a1.y) * q);
        break;
      }
      case 'text': {
        const g = w2s(a.x, a.y);
        ctx.font = `bold ${Math.round(clamp(worldScale * 3.6, 14, 20))}px "Crimson Text",serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = `rgba(0,0,0,${0.6 * (1 - p)})`;
        ctx.strokeText(a.text, g.x, g.y - 14 - p * 22);
        ctx.fillStyle = `rgba(${a.col},${1 - p * p})`;
        ctx.fillText(a.text, g.x, g.y - 14 - p * 22);
        break;
      }
      case 'smoke': {
        const f = fwdVec(a.h);
        if (p < 0.2) {
          const g = w2s(a.x, a.y), q = p / 0.2;
          ctx.fillStyle = `rgba(255,190,80,${0.9 * (1 - q)})`;
          ctx.beginPath(); ctx.arc(g.x + f.x * 4 * q, g.y + f.y * 4 * q, Math.max(4, w2r(1.4)) * (1 + q), 0, TAU); ctx.fill();
        }
        for (let i = 0; i < 4; i++) {
          const d = (1 + i) * 0.9 * p * (REDUCED_MOTION ? 0.3 : 1);
          const g = w2s(a.x + f.x * d * 2 + Math.sin(i * 2.1) * p, a.y + f.y * d * 2 + Math.cos(i * 1.7) * p - p * 1.5);
          ctx.fillStyle = `rgba(215,210,200,${0.45 * (1 - p)})`;
          ctx.beginPath(); ctx.arc(g.x, g.y, Math.max(3, w2r(0.9)) * (1 + p * 2.2) * (1 - i * 0.12), 0, TAU); ctx.fill();
        }
        break;
      }
      case 'fitting': {
        // 0-0.35: topple outboard; 0.35-1: float, drift and sink.
        const fall = Math.min(1, p / 0.35), off = a.shipW * 0.5 + 1.2 * fall + p * 1.2;
        const g = w2s(a.x + a.dx * off, a.y + a.dy * off);
        const alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
        const L = a.mast ? Math.max(8, w2r(3.2)) : Math.max(5, w2r(1.6));
        ctx.save(); ctx.translate(g.x, g.y);
        ctx.rotate(Math.atan2(a.dy, a.dx) - Math.PI / 2 * (1 - fall));
        ctx.globalAlpha = alpha;
        if (a.mast) {
          ctx.strokeStyle = '#6b4c30'; ctx.lineWidth = Math.max(2, w2r(0.5));
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
          ctx.fillStyle = 'rgba(245,235,215,.95)';
          ctx.beginPath(); ctx.moveTo(L * 0.25, 0); ctx.lineTo(L * 0.8, 0); ctx.lineTo(L * 0.55, L * 0.35); ctx.closePath(); ctx.fill();
        } else if (a.kind === 'stack') {
          ctx.fillStyle = '#26262c'; ctx.strokeStyle = '#111'; ctx.lineWidth = 1;
          ctx.fillRect(0, -L * 0.3, L * 0.9, L * 0.6); ctx.strokeRect(0, -L * 0.3, L * 0.9, L * 0.6);
        } else if (a.kind === 'turret') {
          ctx.fillStyle = '#3a3a44'; ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1.5, L * 0.2);
          ctx.beginPath(); ctx.arc(L * 0.4, 0, L * 0.45, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.moveTo(L * 0.4, 0); ctx.lineTo(L * 1.3, 0); ctx.stroke();
        } else {
          ctx.fillStyle = '#8b5e34'; ctx.strokeStyle = '#3c2415'; ctx.lineWidth = 1;
          ctx.fillRect(0, -L / 2, L, L); ctx.strokeRect(0, -L / 2, L, L);
        }
        ctx.restore();
        if (fall >= 1) {
          ctx.strokeStyle = `rgba(200,230,255,${0.6 * (1 - p)})`; ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(g.x, g.y, 3 + (p - 0.35) * 18, 0, TAU); ctx.stroke();
        }
        break;
      }
      case 'wreck': {
        const g = w2s(a.pose.x, a.pose.y);
        ctx.save();
        ctx.translate(g.x, g.y); ctx.rotate(a.tilt * p); ctx.scale(1 - 0.55 * p, 1 - 0.55 * p); ctx.translate(-g.x, -g.y);
        drawShipBody(a.ship, a.pose, Math.max(0, 1 - p * 1.1), false);
        ctx.restore();
        break;
      }
      case 'bump': {
        const g = w2s(a.x, a.y);
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
}
