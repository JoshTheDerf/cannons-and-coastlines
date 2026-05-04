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

  // Priority 1: If touching own island, collect coin (skip if already collected this turn)
  const islandIdx = shipTouchingIsland(ship);
  if (islandIdx >= 0 && G.islandOwner[islandIdx] === ap && !G.collectedThisTurn[islandIdx]) {
    if (executeIslandAction(ship, islandIdx, ap)) {
      ship.hasActed = true;
      refreshAllUI();
      setTimeout(() => aiPlayTurn(ap), AI_DELAY);
      return;
    }
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
  const posScore = aiScorePosition(ship, target, ap);
  const bestShot = posScore.shot;
  // For LOS we need the slot's own origin point, not the ship center, since
  // the bow/turret/rear slots can have very different sightlines.
  let hasLOS = false;
  if (bestShot.slotIdx >= 0) {
    const slot = getShipSlots(getFaction(ap))[bestShot.slotIdx];
    const w = slotWorld(ship, slot);
    hasLOS = !shotPathCheck(w.x, w.y, target.x, target.y);
  }
  const misses = ship._aiMisses || 0;

  const shouldFire = misses < 2
    && hasLOS
    && bestShot.hitProb > 0.25
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
  const baseAng = Math.atan2(t.x - ship.x, -(t.y - ship.y));
  // Walk each ring from farthest down, and try a small fan of nearby angles
  // so we can route around terrain instead of just refusing to move.
  const fan = [0, 0.25, -0.25, 0.5, -0.5, 0.85, -0.85];
  for (let r = rings.length - 1; r >= 0; r--) {
    for (const da of fan) {
      const ang = baseAng + da;
      const cx = ship.x + Math.sin(ang) * rings[r];
      const cy = ship.y - Math.cos(ang) * rings[r];
      if (cx < 0.5 || cx > WORLD_W - 0.5 || cy < 0.5 || cy > WORLD_H - 0.5) continue;
      if (canMoveTo(ship, cx, cy)) {
        ship.heading = angleDelta(cx - ship.x, cy - ship.y);
        ship.x = cx; ship.y = cy;
        sfxMove();
        return;
      }
    }
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

function aiScorePosition(ship, target, ap) {
  const d = dist(ship.x, ship.y, target.x, target.y);
  // "shotScore" replaces the old generic broadside metric. We ask: from this
  // ship+heading, what is the actual best slot's firing fit on the target?
  // This naturally handles forward-firing (Industry), rear-firing (Islanders),
  // and broadside layouts without baking 90° into the formula.
  const shot = ap != null ? aiBestShot(ship, target, ap) : { hitProb: 0, accuracy: Infinity };
  const shotScore = shot.hitProb;
  const enemyAngle = normAngle(Math.atan2(ship.x - target.x, -(ship.y - target.y)) - target.heading);
  const flanking = 1 - Math.abs(Math.sin(enemyAngle));
  const rangeScore = Math.max(0, 1 - Math.abs(d - AI_OPTIMAL_RANGE) / AI_OPTIMAL_RANGE);
  return { shotScore, broadside: shotScore, flanking, rangeScore, distance: d, shot };
}

/**
 * For a ship/target pair, return the index of the cannon slot whose lane
 * brings the shot closest to the target. Lane = ray from slot in slot dir.
 */
function aiBestShot(ship, target, ap) {
  const slots = getShipSlots(getFaction(ap));
  let bestIdx = -1, bestPerp = Infinity, bestForward = 0;
  for (let i = 0; i < slots.length; i++) {
    const w = slotWorld(ship, slots[i]);
    const tx = target.x - w.x, ty = target.y - w.y;
    const forward = tx * w.dx + ty * w.dy;        // distance along lane to target
    if (forward <= 0 || forward > SHOT_RANGE * 1.2) continue; // target behind / out of range
    const perp = Math.abs(tx * (-w.dy) + ty * w.dx); // perpendicular distance
    if (perp < bestPerp) { bestPerp = perp; bestIdx = i; bestForward = forward; }
  }
  if (bestIdx < 0) return { slotIdx: -1, hitProb: 0, accuracy: Infinity };
  const hitProb = Math.max(0, Math.min(0.9, HIT_RADIUS / (bestPerp + SHOT_SCATTER + 0.1)));
  return { slotIdx: bestIdx, accuracy: bestPerp, distance: bestForward, hitProb };
}

// ═══════════════════════════════════════════════════════════════
// TACTICAL MOVEMENT
// ═══════════════════════════════════════════════════════════════

function aiTacticalMove(ship, target, allEnemies, ap) {
  const rings = getMoveRings(ap);
  const currentDist = dist(ship.x, ship.y, target.x, target.y);
  let bestCandidate = null, bestScore = -Infinity;

  // Try every ring radius (each click brings the ship closer; AI may stop short).
  // 32 angles × N rings gives a much denser search than the previous max-only sweep,
  // which often returned no candidate when the outer ring was blocked.
  const ANGLES = 32;
  for (const moveR of rings) {
   for (let i = 0; i < ANGLES; i++) {
    const angle = (i / ANGLES) * Math.PI * 2;
    let cx = ship.x + Math.sin(angle) * moveR;
    let cy = ship.y - Math.cos(angle) * moveR;
    if (cx < 0.5 || cx > WORLD_W - 0.5 || cy < 0.5 || cy > WORLD_H - 0.5) continue;
    if (!canMoveTo(ship, cx, cy)) continue;

    const heading = angleDelta(cx - ship.x, cy - ship.y);
    const virt = { x: cx, y: cy, heading };
    const ps = aiScorePosition(virt, target, ap);
    let score = 0;

    const closingDelta = currentDist - ps.distance;
    if (ps.distance > AI_OPTIMAL_RANGE) {
      score += closingDelta * 30;
      score -= Math.max(0, ps.distance - AI_OPTIMAL_RANGE) * 10;
    } else {
      score += ps.rangeScore * 25;
    }

    score += ps.shotScore * AI_BROADSIDE_BONUS;
    score += ps.flanking * AI_FLANKING_BONUS;

    // LOS from the actual slot origin, not the ship center.
    let los = false;
    if (ps.shot.slotIdx >= 0) {
      const slot = getShipSlots(getFaction(ap))[ps.shot.slotIdx];
      const w = slotWorld(virt, slot);
      los = !shotPathCheck(w.x, w.y, target.x, target.y);
    }
    if (los && ps.shot.hitProb > 0.3) score += 40;
    else if (los && ps.shot.hitProb > 0.15) score += 10;
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
  }

  // Fallback: if every candidate failed canMoveTo (boxed in by ships/terrain),
  // try a slow nudge along the smallest ring at the angle toward the target.
  if (!bestCandidate) {
    const r = rings[0];
    const ang = Math.atan2(target.x - ship.x, -(target.y - ship.y));
    for (let dr = 1; dr >= 0.25; dr -= 0.25) {
      const cx = ship.x + Math.sin(ang) * r * dr;
      const cy = ship.y - Math.cos(ang) * r * dr;
      if (cx < 0.5 || cx > WORLD_W - 0.5 || cy < 0.5 || cy > WORLD_H - 0.5) continue;
      if (canMoveTo(ship, cx, cy)) { bestCandidate = { x: cx, y: cy }; break; }
    }
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
  if (shot.slotIdx < 0) {
    ship.hasActed = true;
    deselectAll(); refreshAllUI();
    setTimeout(() => aiPlayTurn(ap), AI_DELAY);
    return;
  }

  const slots = getShipSlots(getFaction(ap));
  const slot = slots[shot.slotIdx];
  selectedShip = ship; actionMode = 'fire';

  const landing = computeSlotShot(ship, slot);
  const s = w2s(landing.originX, landing.originY);
  const ep = w2s(landing.x, landing.y);
  stats[ap].shots++;
  sfxFire();
  ship.hasActed = true;

  animCannonball(s.x, s.y, ep.x, ep.y, false, 2).then(() => {
    const pathHit = shotPathCheck(landing.originX, landing.originY, landing.x, landing.y);
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
