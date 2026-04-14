// ═══════════════════════════════════════════════════════════════
// CANNONS & COASTLINES — ai.js
// Tactical AI with island awareness and faction support.
// ═══════════════════════════════════════════════════════════════

const AI_DELAY = 500;
const AI_THINK = 400;

const AI_OPTIMAL_RANGE   = 3.0;
const AI_MAX_RANGE       = 6.0;
const AI_FLANKING_BONUS  = 60;
const AI_BROADSIDE_BONUS = 50;

function checkAiTurn() {
  if (G.phase === 'gameOver' || aiRunning) return;
  const ap = G.activePlayer;
  if (!aiControlled[ap]) return;

  aiRunning = true;
  if (G.phase === 'terrain')         setTimeout(() => aiPlaceTerrain(ap), AI_THINK);
  else if (G.phase === 'deployment') setTimeout(() => aiDeploy(ap), AI_THINK);
  else if (G.phase === 'playing')    setTimeout(() => aiPlayTurn(ap), AI_THINK);
  else aiRunning = false;
}

function aiPlaceTerrain(ap) {
  if (!G.terrainPieces.length || G.phase !== 'terrain') {
    aiRunning = false;
    setTimeout(checkAiTurn, AI_DELAY);
    return;
  }
  const piece = G.terrainPieces[0];
  let placed = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const x = 1 + Math.random() * (WORLD_W - 2);
    const y = TERRAIN_EXCL_Y + 0.5 + Math.random() * (WORLD_H - TERRAIN_EXCL_Y * 2 - 1);
    if (canPlaceTerrainAt(x, y, piece.r)) {
      placeTerrainPiece(0, x, y);
      sfxSelect();
      placed = true;
      break;
    }
  }
  if (!placed) {
    G.terrainPieces = [];
    G.phase = 'deployment';
    G.activePlayer = 1;
  }
  refreshAllUI();
  aiRunning = false;
  setTimeout(checkAiTurn, AI_DELAY);
}

function aiDeploy(ap) {
  const unplaced = G.players[ap].ships.filter(s => s.x < 0);
  if (!unplaced.length) {
    confirmDeployment();
    aiRunning = false;
    setTimeout(checkAiTurn, AI_DELAY);
    return;
  }
  const ship = unplaced[0];
  const zone = HOME_ZONE[ap];
  const idx = G.players[ap].ships.indexOf(ship);
  const count = G.players[ap].ships.length;
  const angles = [-0.3, 0, 0.3, -0.15, 0.15];
  const heading = normAngle((ap === 1 ? 0 : Math.PI) + (angles[idx % 5] || 0) * (ap === 1 ? 1 : -1));
  const spacing = Math.min(2.0, (WORLD_W - 2) / count);
  const startX = (WORLD_W - spacing * (count - 1)) / 2;
  const tx = startX + idx * spacing + (Math.random() - 0.5) * 0.4;
  const ty = (zone.yMin + zone.yMax) / 2 + (Math.random() - 0.5) * 0.3;
  if (canDeploy(tx, ty, ap)) {
    ship.x = tx; ship.y = ty; ship.heading = heading;
    sfxSelect();
  }
  refreshAllUI();
  setTimeout(() => aiDeploy(ap), AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// TURN LOOP
// ═══════════════════════════════════════════════════════════════

function aiPlayTurn(ap) {
  if (G.phase === 'gameOver') { aiRunning = false; return; }
  const ships = G.players[ap].ships.filter(s => s.hp > 0 && !s.hasActed);
  if (!ships.length) {
    // Check if AI should declare victory
    if (G.turn >= VICTORY_MIN_TURN) {
      const vps = calcBonuses();
      const enemy = ap === 1 ? 2 : 1;
      if (vps[ap].total > vps[enemy].total + 4) {
        triggerVictoryDeclare(ap);
        aiRunning = false;
        return;
      }
    }
    endTurn(); sfxTurnChange(); refreshAllUI();
    aiRunning = false;
    setTimeout(checkAiTurn, AI_DELAY);
    return;
  }

  const ship = ships[0];
  const enemy = ap === 1 ? 2 : 1;
  const enemies = G.players[enemy].ships.filter(s => s.hp > 0);

  // Priority 1: If touching own island, collect coin
  const islandIdx = shipTouchingIsland(ship);
  if (islandIdx >= 0 && G.islandOwner[islandIdx] === ap) {
    executeIslandAction(ship, islandIdx, ap);
    ship.hasActed = true;
    refreshAllUI();
    setTimeout(() => aiPlayTurn(ap), AI_DELAY);
    return;
  }

  // Priority 2: If touching uncaptured/enemy island (no enemy contesting), capture
  if (islandIdx >= 0 && G.islandOwner[islandIdx] !== ap && !enemyContestingIsland(islandIdx, ap)) {
    executeIslandAction(ship, islandIdx, ap);
    ship.hasActed = true;
    refreshAllUI();
    setTimeout(() => aiPlayTurn(ap), AI_DELAY);
    return;
  }

  if (!enemies.length) {
    // No enemies left, move toward uncaptured islands
    aiMoveTowardIsland(ship, ap);
    ship.hasActed = true;
    refreshAllUI();
    setTimeout(() => aiPlayTurn(ap), AI_DELAY);
    return;
  }

  const target = aiPickTarget(ship, enemies);
  const posScore = aiScorePosition(ship, target);
  const bestShot = aiBestShot(ship, target, ap);
  const hasLOS = !shotPathCheck(ship.x, ship.y, target.x, target.y);
  const misses = ship._aiMisses || 0;

  const shouldFire = misses < 2
    && hasLOS
    && bestShot.hitProb > 0.25
    && posScore.broadside > 0.7
    && posScore.distance < AI_MAX_RANGE;

  if (shouldFire) {
    aiFireAtTarget(ship, target, bestShot, ap);
  } else {
    if (misses >= 2) ship._aiMisses = 0;
    // Decide: move toward enemy or uncaptured island?
    const nearestUncaptured = aiNearestUncapturedIsland(ship, ap);
    if (nearestUncaptured && nearestUncaptured.dist < posScore.distance * 0.6) {
      aiMoveTowardIsland(ship, ap);
      ship.hasActed = true;
      refreshAllUI();
      setTimeout(() => aiPlayTurn(ap), AI_DELAY);
    } else {
      aiTacticalMove(ship, target, enemies, ap);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ISLAND AI
// ═══════════════════════════════════════════════════════════════

function aiNearestUncapturedIsland(ship, ap) {
  let best = null, bestDist = Infinity;
  G.terrain.forEach((t, i) => {
    if (t.type !== 'island') return;
    if (G.islandOwner[i] === ap) return; // already ours
    const d = dist(ship.x, ship.y, t.x, t.y);
    if (d < bestDist) { bestDist = d; best = { idx: i, dist: d }; }
  });
  return best;
}

function aiMoveTowardIsland(ship, ap) {
  const target = aiNearestUncapturedIsland(ship, ap);
  if (!target) return;
  const t = G.terrain[target.idx];
  const rings = getMoveRings(ap);
  const moveR = Math.max(...rings);
  const angle = Math.atan2(t.x - ship.x, -(t.y - ship.y));
  const tx = ship.x + Math.sin(angle) * moveR;
  const ty = ship.y - Math.cos(angle) * moveR;
  const clampedX = Math.max(0.5, Math.min(WORLD_W - 0.5, tx));
  const clampedY = Math.max(0.5, Math.min(WORLD_H - 0.5, ty));
  if (canMoveTo(ship, clampedX, clampedY)) {
    ship.heading = angleDelta(clampedX - ship.x, clampedY - ship.y);
    ship.x = clampedX; ship.y = clampedY;
    sfxMove();
  }
}

// ═══════════════════════════════════════════════════════════════
// TARGET SELECTION & SCORING
// ═══════════════════════════════════════════════════════════════

function aiPickTarget(ship, enemies) {
  let best = null, bestScore = -Infinity;
  enemies.forEach(es => {
    const maxHp = es.maxHp;
    let score = (maxHp - es.hp) * 20 - dist(ship.x, ship.y, es.x, es.y) * 5;
    if (es.hp === 1) score += 30;
    if (score > bestScore) { bestScore = score; best = es; }
  });
  return best;
}

function aiScorePosition(ship, target) {
  const d = dist(ship.x, ship.y, target.x, target.y);
  const angleToTarget = normAngle(Math.atan2(target.x - ship.x, -(target.y - ship.y)));
  const relAngle = normAngle(angleToTarget - ship.heading);
  const broadside = Math.abs(Math.sin(relAngle));
  const enemyAngle = normAngle(Math.atan2(ship.x - target.x, -(ship.y - target.y)) - target.heading);
  const flanking = 1 - Math.abs(Math.sin(enemyAngle));
  const rangeScore = Math.max(0, 1 - Math.abs(d - AI_OPTIMAL_RANGE) / AI_OPTIMAL_RANGE);
  return { broadside, flanking, rangeScore, distance: d };
}

function aiBestShot(ship, target, ap) {
  let bestSide = 0, bestB = 2, bestE = 2, bestDist = Infinity;
  const isIndustry = getPassive(ap) === 'forward_guns';

  for (let side = 0; side < 2; side++) {
    for (let b = 0; b < 5; b++) {
      // Industry can only fire Fore
      if (isIndustry && b !== 0) continue;
      for (let e = 0; e < 5; e++) {
        const base = FIRING_TABLE_PORT[`${b},${e}`];
        if (!base) continue;
        const mir = { dx: side === 1 ? -base.dx : base.dx, dy: base.dy };
        const off = rotVec(mir.dx, mir.dy, ship.heading);
        const rawD = dist(ship.x + off.dx, ship.y + off.dy, target.x, target.y);
        const scatter = 0.25 + e * 0.18;
        const effective = rawD + scatter * 1.2;
        if (effective < bestDist) {
          bestDist = effective; bestSide = side; bestB = b; bestE = e;
        }
      }
    }
  }

  const scatter = 0.25 + bestE * 0.18;
  const base = FIRING_TABLE_PORT[`${bestB},${bestE}`] || { dx: 0, dy: 0 };
  const mir = { dx: bestSide === 1 ? -base.dx : base.dx, dy: base.dy };
  const off = rotVec(mir.dx, mir.dy, ship.heading);
  const rawD = dist(ship.x + off.dx, ship.y + off.dy, target.x, target.y);
  const hitProb = Math.max(0, Math.min(0.9, HIT_RADIUS / (rawD + scatter + 0.1)));

  return { side: bestSide, bearing: bestB, elevation: bestE, accuracy: bestDist, hitProb };
}

// ═══════════════════════════════════════════════════════════════
// TACTICAL MOVEMENT
// ═══════════════════════════════════════════════════════════════

function aiTacticalMove(ship, target, allEnemies, ap) {
  const rings = getMoveRings(ap);
  const moveR = Math.max(...rings);
  const currentDist = dist(ship.x, ship.y, target.x, target.y);
  let bestCandidate = null, bestScore = -Infinity;

  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    let cx = ship.x + Math.sin(angle) * moveR;
    let cy = ship.y - Math.cos(angle) * moveR;
    cx = Math.max(0.5, Math.min(WORLD_W - 0.5, cx));
    cy = Math.max(0.5, Math.min(WORLD_H - 0.5, cy));
    if (!canMoveTo(ship, cx, cy)) continue;

    const heading = angleDelta(cx - ship.x, cy - ship.y);
    const virt = { x: cx, y: cy, heading };
    const ps = aiScorePosition(virt, target);
    let score = 0;

    const closingDelta = currentDist - ps.distance;
    if (ps.distance > AI_OPTIMAL_RANGE) {
      score += closingDelta * 30;
      score -= Math.max(0, ps.distance - AI_OPTIMAL_RANGE) * 10;
    } else {
      score += ps.rangeScore * 25;
    }

    score += ps.broadside * AI_BROADSIDE_BONUS;
    score += ps.flanking * AI_FLANKING_BONUS;

    const shot = aiBestShot(virt, target, ap);
    const los = !shotPathCheck(cx, cy, target.x, target.y);
    if (los && shot.hitProb > 0.3 && ps.broadside > 0.7) score += 40;
    else if (los && shot.hitProb > 0.15) score += 10;
    else if (!los) score -= 10;

    // Proximity to uncaptured islands is a bonus
    G.terrain.forEach((t, idx) => {
      if (t.type !== 'island' || G.islandOwner[idx] === ap) return;
      const id = dist(cx, cy, t.x, t.y);
      if (id < t.r + SHIP_RADIUS + ISLAND_TOUCH_DIST + 0.5) score += 15;
    });

    G.players[ap].ships.forEach(fs => {
      if (fs.id === ship.id || fs.hp <= 0) return;
      const fd = dist(cx, cy, fs.x, fs.y);
      if (fd < 2.0) score -= (2.0 - fd) * 12;
    });

    allEnemies.forEach(es => {
      const ed = dist(cx, cy, es.x, es.y);
      if (ed < 1.2) score -= (1.2 - ed) * 18;
    });

    score -= dist(cx, cy, WORLD_W / 2, WORLD_H / 2) * 0.3;
    score += (Math.random() - 0.5) * 4;

    if (score > bestScore) { bestScore = score; bestCandidate = { x: cx, y: cy }; }
  }

  if (bestCandidate) {
    ship.heading = angleDelta(bestCandidate.x - ship.x, bestCandidate.y - ship.y);
    ship.x = bestCandidate.x;
    ship.y = bestCandidate.y;
    sfxMove();
  }
  ship.hasActed = true;
  refreshAllUI();
  setTimeout(() => aiPlayTurn(ap), AI_DELAY);
}

// ═══════════════════════════════════════════════════════════════
// FIRE EXECUTION
// ═══════════════════════════════════════════════════════════════

function aiFireAtTarget(ship, target, shot, ap) {
  const enemy = ap === 1 ? 2 : 1;

  let b = shot.bearing, e = shot.elevation;
  if (Math.random() < 0.25) b = Math.max(0, Math.min(4, b + (Math.random() < 0.5 ? -1 : 1)));
  if (Math.random() < 0.25) e = Math.max(0, Math.min(4, e + (Math.random() < 0.5 ? -1 : 1)));
  // Industry: lock bearing to Fore
  if (getPassive(ap) === 'forward_guns') b = 0;

  aimSide = shot.side; aimBearing = b; aimElev = e;
  selectedShip = ship; actionMode = 'fire';

  const landing = computeFiringSolution(ship, aimSide, aimBearing, aimElev);
  const s = w2s(ship.x, ship.y);
  const ep = w2s(landing.x, landing.y);
  stats[ap].shots++;
  sfxFire();
  ship.hasActed = true;

  animCannonball(s.x, s.y, ep.x, ep.y, false, aimElev).then(() => {
    const pathHit = shotPathCheck(ship.x, ship.y, landing.x, landing.y);
    if (pathHit) {
      const hp = w2s(pathHit.hitX, pathHit.hitY);
      animTerrainHit(hp.x, hp.y);
      ship._aiMisses = (ship._aiMisses || 0) + 1;
      deselectAll(); refreshAllUI();
      setTimeout(() => aiPlayTurn(ap), AI_DELAY);
      return;
    }

    const hitShip = G.players[enemy].ships.find(es =>
      es.hp > 0 && dist(landing.x, landing.y, es.x, es.y) <= HIT_RADIUS
    );

    if (hitShip) {
      ship._aiMisses = 0;
      const dmg = applyDamage(hitShip, 1, ap);
      if (dmg > 0) {
        stats[ap].hits++;
        animHitFlash(ep.x, ep.y);
        animDamageNumber(ep.x, ep.y, `-${dmg}`);
        if (hitShip.hp <= 0) {
          stats[ap].shipsSunk++;
          trackSunkShip(hitShip, enemy);
          setTimeout(() => animSinking(ep.x, ep.y), 200);
          if (allShipsSunk(enemy)) { setTimeout(() => triggerGameOver(ap), 1800); aiRunning = false; return; }
        } else { sfxMastFall(); }
      } else {
        ship._aiMisses = (ship._aiMisses || 0) + 1;
        animDamageNumber(ep.x, ep.y, 'Blocked!');
        animSplash(ep.x, ep.y);
      }
    } else {
      ship._aiMisses = (ship._aiMisses || 0) + 1;
      animSplash(ep.x, ep.y);
    }

    deselectAll(); refreshAllUI();
    setTimeout(() => aiPlayTurn(ap), AI_DELAY);
  });

  deselectAll(); refreshAllUI();
}
