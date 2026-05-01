// ═══════════════════════════════════════════════════════════════
// CANNONS & COASTLINES — main.js
// Game controller: initialization, faction selection, island
// actions, aiming, victory scoring, and turn flow.
// ═══════════════════════════════════════════════════════════════

let gameStarted = false;

// ═══════════════════════════════════════════════════════════════
// GAME INITIALIZATION
// ═══════════════════════════════════════════════════════════════

function startGame(skipSetup, keepAiState) {
  document.getElementById('titleScreen').style.display = 'none';
  document.getElementById('factionScreen').style.display = 'none';
  document.getElementById('gameContainer').style.display = 'flex';
  document.getElementById('gameOverScreen').style.display = 'none';
  if (!keepAiState) { aiControlled[1] = false; aiControlled[2] = false; aiRunning = false; }
  G = createGameState(skipSetup);
  stats = { 1: { shots: 0, hits: 0, shipsSunk: 0 }, 2: { shots: 0, hits: 0, shipsSunk: 0 } };
  initCanvas(); initAudio(); buildAllUI(); resizeCanvas();
  canvas.addEventListener('pointerdown', onCanvasTap);
  window.addEventListener('resize', resizeCanvas);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resizeCanvas);
  document.addEventListener('fullscreenchange', () => setTimeout(resizeCanvas, 100));
  gameStarted = true;
  requestAnimationFrame(() => { resizeCanvas(); requestAnimationFrame(gameLoop); });
}

function startSolo() {
  aiControlled[1] = false; aiControlled[2] = true; aiRunning = false;
  showFactionSelect(true);
}

function startTwoPlayer() {
  showFactionSelect(false);
}

function gameLoop(ts) {
  if (!gameStarted) return;
  updateAnimations(ts);
  drawFrame();
  requestAnimationFrame(gameLoop);
}

// ═══════════════════════════════════════════════════════════════
// FACTION SELECTION SCREEN
// ═══════════════════════════════════════════════════════════════

function showFactionSelect(solo) {
  document.getElementById('titleScreen').style.display = 'none';
  const screen = document.getElementById('factionScreen');
  screen.style.display = 'flex';
  screen.innerHTML = '';

  const title = document.createElement('h2');
  title.textContent = 'Choose Your Factions';
  title.className = 'factionTitle';
  screen.appendChild(title);

  for (const p of [1, 2]) {
    const label = document.createElement('div');
    label.className = 'factionPlayerLabel';
    label.style.color = p === 1 ? '#e74c3c' : '#3498db';
    label.textContent = solo && p === 2 ? 'Player 2 (AI)' : `Player ${p}`;
    screen.appendChild(label);

    const row = document.createElement('div');
    row.className = 'factionRow';

    Object.entries(FACTION_DEFS).forEach(([fid, f]) => {
      const card = document.createElement('div');
      card.className = 'factionCard' + (factionChoice[p] === fid ? ' selected' : '');
      card.innerHTML = `<div class="fcName">${f.name}</div>` +
        `<div class="fcDesc">${f.desc}</div>` +
        `<div class="fcStats">${f.shipCount} ships \u00B7 ${f.mastsVary ? 'varied' : f.masts + 1} fittings \u00B7 MC ${f.moveCount}</div>` +
        `<div class="fcPassive">${f.passiveDesc}</div>`;
      card.addEventListener('click', () => {
        factionChoice[p] = fid;
        showFactionSelect(solo); // re-render
      });
      row.appendChild(card);
    });
    screen.appendChild(row);
  }

  const startBtn = document.createElement('button');
  startBtn.className = 'factionStartBtn';
  startBtn.textContent = 'Start Game';
  startBtn.addEventListener('click', () => {
    if (solo) { aiControlled[1] = false; aiControlled[2] = true; aiRunning = false; }
    startGame(true, solo);
  });
  screen.appendChild(startBtn);

  const customBtn = document.createElement('button');
  customBtn.className = 'factionStartBtn small';
  customBtn.textContent = 'Custom Setup (place terrain)';
  customBtn.addEventListener('click', () => {
    if (solo) { aiControlled[1] = false; aiControlled[2] = true; aiRunning = false; }
    startGame(false, solo);
  });
  screen.appendChild(customBtn);
}

// ═══════════════════════════════════════════════════════════════
// DOM UI BUILDING
// ═══════════════════════════════════════════════════════════════

function buildAllUI() { buildPlayerAreaUI(1); buildPlayerAreaUI(2); updateTurnBanner(); }
function refreshAllUI() { buildAllUI(); }

function buildPlayerAreaUI(p) {
  const area = document.getElementById(p === 1 ? 'p1Area' : 'p2Area');
  area.innerHTML = '';
  if (G.phase === 'terrain')         { buildTerrainUI(p, area); buildAiToggle(p, area); }
  else if (G.phase === 'deployment') { buildDeployUI(p, area);  buildAiToggle(p, area); }
  else if (G.phase === 'playing')    { buildStatusUI(p, area); buildCoinHandUI(p, area); buildEndTurnBtn(p, area); buildVictoryBtn(p, area); buildAiToggle(p, area); buildMuteBtn(p, area); }
}

// ─── Status Bar (faction + VP + islands) ───────────────

function buildStatusUI(p, area) {
  const f = getFaction(p);
  const vp = calcVP(p);
  const islands = islandsOwned(p);
  const coins = G.players[p].coins;
  const el = document.createElement('div');
  el.className = 'statusBar';
  el.innerHTML = `<span class="statusFaction">${f.name}</span>` +
    `<span class="statusVP">${vp}VP</span>` +
    `<span class="statusDetail">${islands}\uD83C\uDFDD ${coins}\uD83E\uDE99</span>`;
  area.appendChild(el);
}

// ─── Coin Hand ────────────────────────────────────────

function buildCoinHandUI(p, area) {
  G.players[p].hand.forEach((cid, i) => {
    const def = COIN_DEFS[cid];
    if (!def) return;
    const el = document.createElement('div');
    el.className = 'coinSlot' + (def.free ? ' freeAction' : '') +
      (selectedCoin === i && actionMode === 'coin' && G.activePlayer === p ? ' selected' : '');
    el.innerHTML = `<span class="coinIcon">${def.icon}</span><span class="coinName">${def.name}</span>` +
      (def.free ? '<span class="freeTag">\u26A1</span>' : '');
    el.title = def.desc;
    el.addEventListener('pointerdown', e => { e.stopPropagation(); onCoinTap(p, i); });
    area.appendChild(el);
  });
}

// ─── End Turn + Victory Button ─────────────────────────

function buildEndTurnBtn(p, area) {
  const btn = document.createElement('button');
  btn.className = 'endTurnBtn';
  btn.textContent = 'End Turn';
  btn.disabled = (G.activePlayer !== p || G.phase !== 'playing');
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); onEndTurn(p); });
  area.appendChild(btn);
}

function buildVictoryBtn(p, area) {
  if (G.activePlayer !== p || G.turn < VICTORY_MIN_TURN) return;
  const vps = calcBonuses();
  const enemy = p === 1 ? 2 : 1;
  if (vps[p].total <= vps[enemy].total) return;
  const btn = document.createElement('button');
  btn.className = 'endTurnBtn victoryBtn';
  btn.textContent = '\u2693 Declare Victory';
  btn.addEventListener('pointerdown', e => { e.stopPropagation(); triggerVictoryDeclare(p); });
  area.appendChild(btn);
}

// ─── Mute & Fullscreen ─────────────────────────────────

function buildMuteBtn(p, area) {
  if (p !== 1) return;
  const mute = document.createElement('button');
  mute.className = 'muteBtn';
  mute.textContent = audioMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
  mute.addEventListener('pointerdown', e => { e.stopPropagation(); toggleMute(); mute.textContent = audioMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A'; });
  area.appendChild(mute);
}

function toggleFullscreen() {
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    const el = document.documentElement;
    (el.requestFullscreen || el.webkitRequestFullscreen).call(el)
      .then(() => setTimeout(resizeCanvas, 100)).catch(() => {});
  } else {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document)
      .then(() => setTimeout(resizeCanvas, 100)).catch(() => {});
  }
}

// ─── AI Toggle ─────────────────────────────────────────

function buildAiToggle(p, area) {
  const btn = document.createElement('button');
  btn.className = 'aiToggleBtn' + (aiControlled[p] ? ' active' : '');
  btn.textContent = aiControlled[p] ? '\uD83E\uDD16' : '\uD83D\uDC64';
  btn.title = aiControlled[p] ? 'AI Controlled' : 'Human';
  btn.addEventListener('pointerdown', e => {
    e.stopPropagation();
    aiControlled[p] = !aiControlled[p];
    refreshAllUI();
    hapticTap();
    if (aiControlled[p] && G.activePlayer === p) setTimeout(checkAiTurn, AI_DELAY);
  });
  area.appendChild(btn);
}

// ─── Terrain Placement UI ──────────────────────────────

function buildTerrainUI(p, area) {
  if (p !== G.activePlayer) {
    area.appendChild(Object.assign(document.createElement('div'), { className: 'phaseLabel', textContent: 'Waiting...' }));
    return;
  }
  area.appendChild(Object.assign(document.createElement('div'), {
    className: 'phaseLabel', textContent: `Place terrain (${G.terrainPieces.length} left)`,
  }));
  G.terrainPieces.forEach((piece, i) => {
    const btn = document.createElement('button');
    btn.className = 'endTurnBtn';
    btn.textContent = TERRAIN_DEFS[piece.type]?.name || piece.type;
    if (selectedTerrainIdx === i) { btn.style.background = '#d4a853'; btn.style.color = '#0a1628'; }
    btn.addEventListener('pointerdown', e => {
      e.stopPropagation(); selectedTerrainIdx = i; actionMode = 'terrain_place';
      refreshAllUI(); hapticTap();
    });
    area.appendChild(btn);
  });
  const skip = document.createElement('button');
  skip.className = 'endTurnBtn'; skip.textContent = 'Skip';
  skip.addEventListener('pointerdown', e => {
    e.stopPropagation();
    G.terrainPieces = []; G.phase = 'deployment'; G.activePlayer = 1;
    selectedTerrainIdx = -1; actionMode = null;
    refreshAllUI();
  });
  area.appendChild(skip);
}

// ─── Fleet Deployment UI ───────────────────────────────

function buildDeployUI(p, area) {
  if (p !== G.activePlayer) {
    area.appendChild(Object.assign(document.createElement('div'), { className: 'phaseLabel', textContent: 'Waiting...' }));
    return;
  }
  const unplaced = G.players[G.activePlayer].ships.filter(s => s.x < 0);
  if (!unplaced.length) {
    area.appendChild(Object.assign(document.createElement('div'), { className: 'phaseLabel', textContent: 'Fleet deployed!' }));
    const btn = document.createElement('button'); btn.className = 'endTurnBtn'; btn.textContent = 'Confirm';
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); confirmDeployment(); });
    area.appendChild(btn);
    return;
  }
  area.appendChild(Object.assign(document.createElement('div'), {
    className: 'phaseLabel', textContent: `Deploy: ${unplaced[0].name}`,
  }));
  const rb = document.createElement('button'); rb.className = 'endTurnBtn'; rb.textContent = '\u21BB Rotate';
  rb.addEventListener('pointerdown', e => { e.stopPropagation(); deployFacing = normAngle(deployFacing + Math.PI / 4); refreshAllUI(); hapticTap(); });
  area.appendChild(rb);
  actionMode = 'deploy';
}

function confirmDeployment() {
  const other = G.activePlayer === 1 ? 2 : 1;
  if (G.players[other].ships.some(s => s.x < 0)) {
    G.activePlayer = other;
    deployFacing = other === 1 ? 0 : Math.PI;
  } else {
    G.phase = 'playing'; G.activePlayer = 1; sfxTurnChange();
    applyHomeWaters(G);
  }
  deselectAll(); refreshAllUI();
  setTimeout(checkAiTurn, AI_DELAY);
}

// ─── Turn Banner ───────────────────────────────────────

function updateTurnBanner() {
  const b = document.getElementById('turnBanner');
  const p = G.activePlayer;
  const f = G.phase === 'playing' ? ` (${getFaction(p).name})` : '';
  const labels = { terrain: 'Place Terrain', deployment: 'Deploy Fleet', playing: `P${p}'s Turn${f}` };
  b.textContent = `\u2693 ${labels[G.phase] || ''} \u2693`;
  b.style.color = p === 1 ? '#e74c3c' : '#3498db';
  b.style.background = p === 1 ? COLORS.p1_banner : COLORS.p2_banner;
  b.style.border = `1px solid ${p === 1 ? '#e74c3c' : '#3498db'}`;
  const p2h = document.getElementById('p2Area')?.offsetHeight || 0;
  const p1h = document.getElementById('p1Area')?.offsetHeight || 0;
  if (p === 1) { b.style.bottom = (p1h + 4) + 'px'; b.style.top = 'auto'; b.style.transform = 'translateX(-50%)'; }
  else { b.style.top = (p2h + 4) + 'px'; b.style.bottom = 'auto'; b.style.transform = 'translateX(-50%) rotate(180deg)'; }
}

// ═══════════════════════════════════════════════════════════════
// CANVAS INPUT
// ═══════════════════════════════════════════════════════════════

function onCanvasTap(e) {
  if (isAnimating()) return;
  const rect = canvas.getBoundingClientRect();
  const { x: wx, y: wy } = s2w(e.clientX - rect.left, e.clientY - rect.top);
  const ap = G.activePlayer;

  // Terrain placement
  if (G.phase === 'terrain' && actionMode === 'terrain_place' && selectedTerrainIdx >= 0) {
    const piece = G.terrainPieces[selectedTerrainIdx];
    if (piece && canPlaceTerrainAt(wx, wy, piece.r)) {
      placeTerrainPiece(selectedTerrainIdx, wx, wy);
      hapticTap(); sfxSelect(); refreshAllUI();
      setTimeout(checkAiTurn, AI_DELAY);
    }
    return;
  }
  if (G.phase === 'terrain') return;

  // Fleet deployment
  if (G.phase === 'deployment' && actionMode === 'deploy') {
    const unplaced = G.players[ap].ships.filter(s => s.x < 0);
    if (unplaced.length && canDeploy(wx, wy, ap)) {
      unplaced[0].x = wx; unplaced[0].y = wy; unplaced[0].heading = deployFacing;
      hapticTap(); sfxSelect(); refreshAllUI();
    }
    return;
  }
  if (G.phase !== 'playing') return;

  // Movement
  if (actionMode === 'move' && selectedShip && moveRings.length) {
    const dx = wx - selectedShip.x, dy = wy - selectedShip.y;
    const tapDist = Math.sqrt(dx * dx + dy * dy);
    if (tapDist < 0.15) return;
    const heading = Math.atan2(dx, -dy);
    const dirX = Math.sin(heading), dirY = -Math.cos(heading);
    let bestRing = moveRings[0];
    moveRings.forEach(r => { if (Math.abs(tapDist - r) < Math.abs(tapDist - bestRing)) bestRing = r; });
    const tx = selectedShip.x + dirX * bestRing;
    const ty = selectedShip.y + dirY * bestRing;
    if (canMoveTo(selectedShip, tx, ty)) { executeMove(selectedShip, tx, ty); return; }
    return;
  }

  // Coin targeting
  if (actionMode === 'coin' && selectedCoin !== null) { executeCoinPlay(wx, wy); return; }

  // Ship selection
  const hit = findShipNear(wx, wy, ap, SHIP_RADIUS * 3.5);
  if (hit && hit.ship.hp > 0 && (!hit.ship.hasActed || hit.ship.signaled)) {
    selectShip(hit.ship, e.clientX - rect.left, e.clientY - rect.top);
    return;
  }

  // Deselect
  deselectAll(); hideRadialMenu(); hideAimPanel(); refreshAllUI();
}

// ═══════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════

function selectShip(ship, sx, sy) {
  selectedShip = ship; actionMode = null; selectedCoin = null; moveRings = [];
  hideAimPanel(); showRadialMenu(sx, sy, ship);
  sfxSelect(); hapticTap(); refreshAllUI();
}

function chooseAction(action) {
  hideRadialMenu();
  if (!selectedShip) return;
  const ap = G.activePlayer;
  actionMode = action;
  if (action === 'move') {
    moveRings = getMoveRings(ap);
  } else if (action === 'fire') {
    showAimPanel();
  } else if (action === 'island') {
    const idx = shipTouchingIsland(selectedShip);
    if (idx >= 0) {
      executeIslandAction(selectedShip, idx, ap);
      selectedShip.hasActed = true;
      deselectAll(); refreshAllUI();
    }
  }
  refreshAllUI();
}

function executeMove(ship, tx, ty) {
  const newHeading = angleDelta(tx - ship.x, ty - ship.y);
  if (ship._evasive) {
    const diff1 = Math.abs(normAngle(newHeading - ship.heading) - Math.PI / 2);
    const diff2 = Math.abs(normAngle(newHeading - ship.heading) - Math.PI * 1.5);
    if (Math.min(diff1, diff2) > Math.PI / 4) return;
    delete ship._evasive;
  } else {
    ship.heading = newHeading;
  }
  ship.x = tx; ship.y = ty; ship.hasActed = true;
  sfxMove(); hapticTap();
  deselectAll(); hideRadialMenu(); refreshAllUI();
}

// ─── Island Actions ────────────────────────────────────

function executeIslandAction(ship, islandIdx, ap) {
  const owner = G.islandOwner[islandIdx];
  const t = G.terrain[islandIdx];
  const { x: sx, y: sy } = w2s(t.x, t.y);

  if (owner === ap) {
    // Collect coins from own island
    let drawCount = 1;
    if (getPassive(ap) === 'bountiful_harvest') drawCount = 2;
    for (let i = 0; i < drawCount; i++) {
      if (G.bag.length > 0) {
        G.players[ap].hand.push(G.bag.pop());
        G.players[ap].coins++;
      }
    }
    sfxCoinPlay();
    animSparkle(sx, sy);
  } else {
    // Capture: raise flag (if no enemy contesting)
    if (!enemyContestingIsland(islandIdx, ap)) {
      G.islandOwner[islandIdx] = ap;
      sfxSelect();
      animFlags(sx, sy);
      // Plunder passive: extra coin on capture
      if (getPassive(ap) === 'plunder' && G.bag.length > 0) {
        G.players[ap].hand.push(G.bag.pop());
      }
    }
  }
}

// ─── Firing ────────────────────────────────────────────

function fireCannon() {
  if (!selectedShip || actionMode !== 'fire') return;
  const ship = selectedShip, ap = G.activePlayer, enemy = ap === 1 ? 2 : 1;
  const landing = computeFiringSolution(ship, aimSide, aimBearing, aimElev);
  const s = w2s(ship.x, ship.y), e = w2s(landing.x, landing.y);
  const isDouble = ship._doubleShot && !ship._doubleFired;

  stats[ap].shots++; sfxFire(); hapticThud();
  ship.hasActed = true;
  hideAimPanel(); aimPreviewData = null;

  animCannonball(s.x, s.y, e.x, e.y, false, aimElev).then(() => {
    const pathHit = shotPathCheck(ship.x, ship.y, landing.x, landing.y);
    if (pathHit) {
      const hp = w2s(pathHit.hitX, pathHit.hitY);
      animTerrainHit(hp.x, hp.y);
      finishShot(ship, isDouble); return;
    }
    const th = G.terrain.find(t => dist(landing.x, landing.y, t.x, t.y) <= t.r);
    if (th) { animTerrainHit(e.x, e.y); finishShot(ship, isDouble); return; }
    let hitShip = null;
    G.players[enemy].ships.forEach(es => {
      if (es.hp > 0 && dist(landing.x, landing.y, es.x, es.y) <= HIT_RADIUS) hitShip = es;
    });
    if (hitShip) {
      const dmg = applyDamage(hitShip, 1, ap);
      if (dmg > 0) {
        stats[ap].hits++;
        animHitFlash(e.x, e.y); animDamageNumber(e.x, e.y, `-${dmg}`);
        if (hitShip.hp <= 0) {
          stats[ap].shipsSunk++;
          trackSunkShip(hitShip, enemy);
          setTimeout(() => animSinking(e.x, e.y), 200);
          if (allShipsSunk(enemy)) setTimeout(() => triggerGameOver(ap), 1800);
        } else { sfxMastFall(); }
      } else { animDamageNumber(e.x, e.y, 'Blocked!'); animSplash(e.x, e.y); }
    } else { animSplash(e.x, e.y); }
    finishShot(ship, isDouble);
  });

  const saved = ship; deselectAll(); selectedShip = saved; refreshAllUI();
}

function finishShot(ship, isDouble) {
  if (isDouble && !ship._doubleFired) { ship._doubleFired = true; selectedShip = ship; actionMode = 'fire'; setTimeout(showAimPanel, 300); return; }
  delete ship._doubleShot; delete ship._doubleFired;
  ship.hasActed = true;
  deselectAll(); refreshAllUI();
}

// ─── Coin Play ────────────────────────────────────────

function onCoinTap(player, index) {
  if (player !== G.activePlayer || G.phase !== 'playing') return;
  if (selectedCoin === index && actionMode === 'coin') { selectedCoin = null; actionMode = null; refreshAllUI(); return; }
  selectedCoin = index; actionMode = 'coin'; hapticTap(); refreshAllUI();
}

function executeCoinPlay(wx, wy) {
  const ap = G.activePlayer, hand = G.players[ap].hand;
  if (selectedCoin === null || selectedCoin >= hand.length) return;
  const cid = hand[selectedCoin], cidx = selectedCoin;
  if (resolveCoin(cid, wx, wy, ap)) {
    const ca = actionMode;
    hand.splice(cidx, 1);
    G.bag.push(cid); // spent coins return to bag
    selectedCoin = null;
    if (ca === 'coin') actionMode = null;
    refreshAllUI();
  }
}

// ─── Shadow Fleet Revival ──────────────────────────────

function tryReviveShadowShip(ap) {
  if (getPassive(ap) !== 'return_from_deep') return false;
  if (!G.sunkShips[ap] || !G.sunkShips[ap].length) return false;
  if (G.players[ap].hand.length < 2) return false;
  // Need at least one owned island
  let ownedIslandIdx = -1;
  for (let i = 0; i < G.terrain.length; i++) {
    if (G.terrain[i].type === 'island' && G.islandOwner[i] === ap) { ownedIslandIdx = i; break; }
  }
  if (ownedIslandIdx < 0) return false;

  // Spend 2 coins from hand
  G.bag.push(G.players[ap].hand.pop());
  G.bag.push(G.players[ap].hand.pop());

  const sunkData = G.sunkShips[ap].shift();
  const island = G.terrain[ownedIslandIdx];
  const newShip = {
    id: `p${ap}_revived_${Date.now()}`,
    x: island.x + (Math.random() - 0.5) * 0.5,
    y: island.y + island.r + SHIP_RADIUS + 0.2,
    heading: ap === 1 ? 0 : Math.PI,
    hp: 1, maxHp: sunkData.maxHp, masts: sunkData.maxMasts, maxMasts: sunkData.maxMasts,
    hasActed: true, braced: false, signaled: false, stoneAbsorbed: false,
    name: sunkData.name,
  };
  G.players[ap].ships.push(newShip);
  const { x: sx, y: sy } = w2s(newShip.x, newShip.y);
  animSparkle(sx, sy);
  sfxCoinPlay();
  return true;
}

function onEndTurn(p) {
  if (p !== G.activePlayer || G.phase !== 'playing') return;
  endTurn(); sfxTurnChange(); hapticTap(); refreshAllUI();
  setTimeout(checkAiTurn, AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// RADIAL MENU (Move / Fire / Coin / Island)
// ═══════════════════════════════════════════════════════════════

function showRadialMenu(x, y, ship) {
  const rm = document.getElementById('radialMenu');
  rm.style.display = 'block';
  const p2h = document.getElementById('p2Area')?.offsetHeight || 0;
  rm.style.left = (x - 70) + 'px';
  rm.style.top = (p2h + y - 70) + 'px';

  // Build buttons dynamically based on context
  rm.innerHTML = '';
  const ap = G.activePlayer;
  const buttons = [
    { cls: 'move', icon: '\u2693', action: 'move', title: 'Move' },
    { cls: 'fire', icon: '\uD83D\uDCA5', action: 'fire', title: 'Fire' },
  ];

  // Island action if touching an island
  const islandIdx = shipTouchingIsland(ship);
  if (islandIdx >= 0) {
    const owner = G.islandOwner[islandIdx];
    if (owner === ap) {
      buttons.push({ cls: 'island', icon: '\uD83E\uDE99', action: 'island', title: 'Collect Coin' });
    } else if (!enemyContestingIsland(islandIdx, ap)) {
      buttons.push({ cls: 'island', icon: '\uD83D\uDEA9', action: 'island', title: 'Raise Flag' });
    }
  }

  const angleStep = Math.PI * 2 / Math.max(buttons.length, 3);
  const startAngle = ap === 1 ? -Math.PI / 2 : Math.PI / 2;
  const radius = 48;

  buttons.forEach((b, i) => {
    const angle = startAngle + (i - (buttons.length - 1) / 2) * (Math.PI / 3);
    const bx = 70 + Math.cos(angle) * radius - 26;
    const by = 70 + Math.sin(angle) * radius - 26;
    const el = document.createElement('div');
    el.className = `radBtn ${b.cls}`;
    el.title = b.title;
    el.textContent = b.icon;
    el.style.left = bx + 'px';
    el.style.top = by + 'px';
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); chooseAction(b.action); });
    rm.appendChild(el);
  });
}

function hideRadialMenu() { document.getElementById('radialMenu').style.display = 'none'; }

// ═══════════════════════════════════════════════════════════════
// AIMING PANEL
// ═══════════════════════════════════════════════════════════════

function showAimPanel() {
  const panel = document.getElementById('aimPanel');
  const ap = G.activePlayer;
  panel.className = ap === 1 ? 'p1' : 'p2';
  panel.style.bottom = ap === 1 ? '0' : 'auto';
  panel.style.top = ap === 1 ? 'auto' : '0';
  panel.style.display = 'block';
  aimSide = 0; aimBearing = 2; aimElev = 2;
  // Industry: lock bearing to Fore
  if (getPassive(ap) === 'forward_guns') aimBearing = 0;
  buildDials();
}

function hideAimPanel() { document.getElementById('aimPanel').style.display = 'none'; }

function dismissAiming() {
  hideAimPanel(); aimPreviewData = null; actionMode = null;
  if (selectedShip) {
    delete selectedShip._doubleShot; delete selectedShip._doubleFired;
  }
  deselectAll(); refreshAllUI();
}

let _dialsBusy = false;

function buildDials() {
  const ap = G.activePlayer;
  const isIndustry = getPassive(ap) === 'forward_guns';

  buildSideToggle();
  const bLabels = aimSide === 0 ? BEARING_LABELS : [...BEARING_LABELS].reverse();
  const bIdx = aimSide === 0 ? aimBearing : (4 - aimBearing);
  buildSlider('bearingTrack', 'bearingVal', bLabels, bIdx, di => {
    if (_dialsBusy || isIndustry) return; _dialsBusy = true;
    aimBearing = aimSide === 0 ? di : (4 - di);
    buildDials(); sfxDialClick(); hapticTap(); _dialsBusy = false;
  });
  buildSlider('elevTrack', 'elevVal', ELEV_LABELS, aimElev, v => {
    if (_dialsBusy) return; _dialsBusy = true;
    aimElev = v; buildDials(); sfxDialClick(); hapticTap(); _dialsBusy = false;
  });
  document.getElementById('bearingVal').textContent = isIndustry ? 'Fore (locked)' : BEARING_LABELS[aimBearing];
  document.getElementById('elevVal').textContent = ELEV_LABELS[aimElev];
  updateAimPreview();
}

function buildSideToggle() {
  const c = document.getElementById('sideToggle');
  c.innerHTML = '';
  function mk(cls, txt, val) {
    const b = document.createElement('div');
    b.className = 'sideBtn ' + cls + (aimSide === val ? ' active' : '');
    b.textContent = txt;
    b.addEventListener('pointerdown', e => {
      e.stopPropagation(); e.preventDefault();
      if (_dialsBusy || aimSide === val) return; _dialsBusy = true;
      aimSide = val; buildDials(); sfxDialClick(); hapticTap(); _dialsBusy = false;
    });
    return b;
  }
  const div = document.createElement('span'); div.className = 'sideDivider'; div.textContent = '\u00B7';
  c.appendChild(mk('port', '\u25C2 Port', 0));
  c.appendChild(div);
  c.appendChild(mk('stbd', 'Stbd \u25B8', 1));
}

function buildSlider(trackId, valId, labels, currentVal, onChange) {
  const track = document.getElementById(trackId);
  track.innerHTML = '';
  const n = labels.length, pad = 6;
  for (let i = 0; i < n; i++) {
    const pct = pad + i * (100 - 2 * pad) / (n - 1);
    const notch = document.createElement('div');
    notch.className = 'trackNotch' + (i === currentVal ? ' active' : '');
    notch.style.left = pct + '%';
    const lbl = document.createElement('span'); lbl.className = 'trackNotchLabel'; lbl.textContent = labels[i];
    notch.appendChild(lbl);
    track.appendChild(notch);
    const segStart = i === 0 ? 0 : pad + (i - 0.5) * (100 - 2 * pad) / (n - 1);
    const segEnd = i === n - 1 ? 100 : pad + (i + 0.5) * (100 - 2 * pad) / (n - 1);
    const tz = document.createElement('div');
    tz.style.cssText = `position:absolute;top:0;bottom:0;left:${segStart}%;width:${segEnd - segStart}%;cursor:pointer;z-index:1;`;
    tz.addEventListener('pointerdown', ((idx) => e => {
      e.stopPropagation(); e.preventDefault();
      if (idx !== currentVal) onChange(idx);
    })(i));
    track.appendChild(tz);
  }
  const thumb = document.createElement('div'); thumb.className = 'sliderThumb';
  thumb.style.left = `calc(${pad + currentVal * (100 - 2 * pad) / (n - 1)}% - 15px)`;
  track.appendChild(thumb);
}

function updateAimPreview() {
  if (!selectedShip || actionMode !== 'fire') { aimPreviewData = null; return; }
  const base = FIRING_TABLE_PORT[`${aimBearing},${aimElev}`] || { dx: -3, dy: 0 };
  const mir = { dx: aimSide === 1 ? -base.dx : base.dx, dy: base.dy };
  const off = rotVec(mir.dx, mir.dy, selectedShip.heading);
  aimPreviewData = {
    cx: selectedShip.x + off.dx,
    cy: selectedShip.y + off.dy,
    radius: 0.8 + aimElev * 0.5,
    side: aimSide,
  };
}

// ═══════════════════════════════════════════════════════════════
// GAME OVER & VICTORY
// ═══════════════════════════════════════════════════════════════

function triggerGameOver(winner) {
  G.phase = 'gameOver'; sfxVictory(); hapticRumble();
  document.getElementById('gameOverScreen').style.display = 'flex';
  document.getElementById('winnerText').textContent = `Player ${winner} Wins!`;
  const s1 = stats[1], s2 = stats[2];
  const vps = calcBonuses();
  document.getElementById('statsText').innerHTML =
    `<b style="color:#e74c3c">P1 (${getFaction(1).name}):</b> ${vps[1].total} VP` +
    ` (${vps[1].ships}\u00D7${VP_SHIP} ships + ${vps[1].islands}\u00D7${VP_ISLAND} islands + ${vps[1].coins}\u00D7${VP_COIN} coins + ${vps[1].bonus} bonus)<br>` +
    `${s1.shots} shots \u00B7 ${s1.hits} hits \u00B7 ${s1.shots ? Math.round(s1.hits / s1.shots * 100) : 0}%<br><br>` +
    `<b style="color:#3498db">P2 (${getFaction(2).name}):</b> ${vps[2].total} VP` +
    ` (${vps[2].ships}\u00D7${VP_SHIP} ships + ${vps[2].islands}\u00D7${VP_ISLAND} islands + ${vps[2].coins}\u00D7${VP_COIN} coins + ${vps[2].bonus} bonus)<br>` +
    `${s2.shots} shots \u00B7 ${s2.hits} hits \u00B7 ${s2.shots ? Math.round(s2.hits / s2.shots * 100) : 0}%<br><br>` +
    `Game lasted ${G.turn} turns`;
}

function triggerVictoryDeclare(player) {
  const vps = calcBonuses();
  const enemy = player === 1 ? 2 : 1;
  if (vps[player].total > vps[enemy].total) {
    triggerGameOver(player);
  }
}

// ─── Tutorial ──────────────────────────────────────────

function showTutorial() { document.getElementById('tutorialOverlay').style.display = 'flex'; }
function hideTutorial() { document.getElementById('tutorialOverlay').style.display = 'none'; }
