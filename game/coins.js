// ═══════════════════════════════════════════════════════════════
// CANNONS & COASTLINES — coins.js
// Coin effect resolution.
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve a coin effect at world position (wx, wy).
 * @returns {boolean} True if the coin was successfully spent
 */
function resolveCoin(coinId, wx, wy, ap) {
  const def = COIN_DEFS[coinId];
  if (!def) return false;

  const myShip   = findShipNear(wx, wy, ap, SHIP_RADIUS * 2.5);
  const enemy    = ap === 1 ? 2 : 1;
  const enemyHit = findShipNear(wx, wy, enemy, SHIP_RADIUS * 2.5);
  const { x: tx, y: ty } = w2s(wx, wy);

  sfxCoinPlay();
  hapticTap();

  switch (coinId) {

    case 'brace':
      if (!myShip) return false;
      myShip.ship.braced = true;
      animGoldenRing(tx, ty);
      return true;

    case 'signal_flags':
      if (!myShip) return false;
      myShip.ship.hasActed = false;
      myShip.ship.signaled = true;
      animFlags(tx, ty);
      return true;

    case 'full_sail':
      if (!myShip || myShip.ship.hasActed) return false;
      moveRings = [1, 1.8, 2.6, 3.5];
      actionMode = 'move';
      selectedShip = myShip.ship;
      return true;

    case 'evasive':
      if (!myShip || myShip.ship.hasActed) return false;
      moveRings = [SHIP_EVASIVE_DIST];
      actionMode = 'move';
      selectedShip = myShip.ship;
      selectedShip._evasive = true;
      return true;

    case 'skilled_gunner':
      if (!myShip) return false;
      myShip.ship._doubleShot = true;
      selectedShip = myShip.ship;
      actionMode = 'fire';
      showAimPanel();
      return true;

    case 'repair_crew':
      if (!myShip || myShip.ship.hp >= myShip.ship.maxHp) return false;
      myShip.ship.hp++;
      animSparkle(tx, ty);
      return true;

    case 'boarding_party': {
      if (!enemyHit) return false;
      const es = enemyHit.ship;
      const adj = G.players[ap].ships.find(s =>
        s.hp > 0 && dist(s.x, s.y, es.x, es.y) <= SHIP_ADJACENT_DIST
      );
      if (!adj) return false;
      const a = w2s(adj.x, adj.y);
      animBoarding(a.x, a.y, tx, ty);
      const dmg = applyDamage(es, 1, ap);
      animDamageNumber(tx, ty - 8, dmg > 0 ? `-${dmg}` : 'Blocked!');
      if (es.hp <= 0) {
        stats[ap].shipsSunk++;
        animSinking(tx, ty);
        trackSunkShip(es, enemy);
        if (allShipsSunk(enemy)) setTimeout(() => triggerGameOver(ap), 1600);
      }
      // Plunder passive: extra coin on boarding
      if (getPassive(ap) === 'plunder' && G.bag.length > 0) {
        G.players[ap].hand.push(G.bag.pop());
      }
      return true;
    }

    default:
      return false;
  }
}

/**
 * Apply damage to a ship, respecting passives (Stone Hulls, Brace).
 * Returns actual damage dealt.
 */
function applyDamage(ship, baseDmg, attackerPlayer) {
  let dmg = baseDmg;
  // Brace for Impact
  if (ship.braced) {
    dmg = Math.max(0, dmg - 1);
    ship.braced = false;
  }
  // Stone Hulls: first hit per turn absorbed
  const defenderPlayer = attackerPlayer === 1 ? 2 : 1;
  if (dmg > 0 && getPassive(defenderPlayer) === 'stone_hulls' && !ship.stoneAbsorbed) {
    ship.stoneAbsorbed = true;
    dmg = 0;
  }
  ship.hp = Math.max(0, ship.hp - dmg);
  return dmg;
}

/** Track a sunk ship for Shadow Fleet revival. */
function trackSunkShip(ship, player) {
  if (!G.sunkShips[player]) G.sunkShips[player] = [];
  G.sunkShips[player].push({
    name: ship.name,
    maxHp: ship.maxHp,
    maxMasts: ship.maxMasts,
  });
}
