// Playstyles for the simulator: how a seat plays.
//
// Every style runs on one of the computer captain's built-in brains
// (brain.js: tactical, plain, turtle, raider, banker) and may bend it with
// apply(X), which runs once per engine like a variant's. Wrapped functions
// see every seat, so a style checks styleAt(X, p) and leaves other seats
// alone. Pit a style against the computer with `--vs <style>`.
import { wrap, deployOk } from './variants.mjs';

/** The simulator style seat p plays. */
export const styleAt = (X, p) => (X.G.simStyle && X.G.simStyle[p]) || 'tactical';

/**
 * Deploy the way a player gaming the setup rule would: last, with every
 * other fleet already down, each ship at the spot along its stretch of edge
 * and depth in from it (up to the variant's limit, X.__simDeploy) that the
 * computer rates best: gun lanes on enemy ships, out of theirs, and a bonus
 * for touching an island nobody holds. With `aim`, a ship may also turn up
 * to 90 degrees off straight in, to point its broadside. Under the printed
 * rules (no deploy variant) it can only pick spots along the edge.
 */
function gameDeploy(X, p, aim) {
  const G = X.G, cfg = X.__simDeploy || { depth: 0, clear: 0, gap: 0 };
  // The Islanders' Home Waters ship stays at its island.
  const movers = G.players[p].ships.filter(s => !s.touchPrev.length);
  for (const s of movers) s.placed = false;
  const fresh = () => { G.ai = null; X.LANES = { g: null, key: null, lanes: null }; };
  fresh();
  const circle = G.table.shape === 'circle', seat = circle ? null : X.seatOf(p);
  const half = circle ? 40 : seat.span / 2 - 6;
  const enemies = X.allShips().filter(e => e.owner !== p);
  for (const s of movers) {
    let best = null;
    for (let along = -half; along <= half + 1e-6; along += 5) {
      const edge = circle ? X.rimPose(p, s, along) : X.deployPose(p, s, seat.along + along);
      if (!X.canDeployAt(s, edge)) continue;
      const f = X.fwdVec(edge.h), room = cfg.depth ? X.planSlide(s, edge, edge.h, cfg.depth) : null;
      for (const k of cfg.depth ? [0, 0.25, 0.5, 0.75, 1] : [0]) {
        const d = k ? Math.max(0, Math.min(k * cfg.depth, room.moved - (room.stoppedBy ? 2 : 0))) : 0;
        for (const turn of aim ? [0, -0.5, 0.5, -1, 1] : [0]) {
          const ps = { x: edge.x + f.x * d, y: edge.y + f.y * d, h: X.normAngle(edge.h + turn * Math.PI / 2) };
          if ((turn || k) && X.poseGap(s, ps).gap < -X.COLLIDE_EPS) continue;
          if (!deployOk(X, s, ps, cfg, enemies)) continue;
          const sc = X.aiEvalPose(s, ps, undefined) + (X.touchingIslands(s, ps).some(i => G.terrain[i].owner == null) ? 15 : 0);
          if (!best || sc > best.sc) best = { sc, ps };
        }
      }
    }
    if (best) Object.assign(s, best.ps);
    s.placed = true;
  }
  fresh();
}

export const STYLES = {
  tactical: { brain: 'tactical', label: 'The computer: plans islands, fights when a shot pays' },
  plain: { brain: 'plain', label: 'The original, simpler computer' },
  turtle: { brain: 'turtle', label: 'Parks a ship on every island it can and collects' },
  raider: { brain: 'raider', label: 'Hunts ships; takes islands only on the way' },
  banker: { brain: 'banker', label: 'Holds islands and banks coins' },
  // The computer, after gaming the deployment (see gameDeploy). For testing
  // whether a setup rule can be abused: it should win about its share.
  deployer: { brain: 'tactical', label: 'Deploys last, at the best spots the setup rule allows', deploy: (X, p) => gameDeploy(X, p, false) },
  'deployer-aim': { brain: 'tactical', label: 'Deploys last at the best spots, ships turned to aim', deploy: (X, p) => gameDeploy(X, p, true) },
  // A raider that keeps its ships within a short reach of each other, the
  // way a player might cross the table: as one group, not one by one.
  pack: {
    brain: 'raider',
    label: 'Crosses as one group and hunts together',
    apply(X) {
      wrap(X, 'aiEvalPose', orig => (ship, ps, goal) => {
        const sc = orig(ship, ps, goal);
        if (styleAt(X, ship.owner) !== 'pack') return sc;
        const mates = X.G.players[ship.owner].ships.filter(o => o.id !== ship.id && !X.isDead(o));
        if (!mates.length) return sc;
        const cx = mates.reduce((a, o) => a + o.x, 0) / mates.length, cy = mates.reduce((a, o) => a + o.y, 0) / mates.length;
        const d = X.dist(ps.x, ps.y, cx, cy);
        return d > 25 ? sc - (d - 25) * 0.4 : sc;
      });
    },
  },
};

export function styleSpec(name) {
  const s = STYLES[name];
  if (!s) throw new Error(`unknown style "${name}" (have: ${Object.keys(STYLES).join(', ')})`);
  return s;
}
