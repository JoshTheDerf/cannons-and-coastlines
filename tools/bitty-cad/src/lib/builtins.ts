// Built-in synthetic modules. Resolved by `use(name)` after user files.
// Source is plain JS so users see (and can copy from) the same surface they
// would write themselves. Each module's leading comment is the reference.

const LAYOUT = `
/**
 * layout — placement, arrays, and Manifold combinators.
 *
 * Mirroring:
 *   mirror(mf, axis)            — flip along an axis: 'x' | 'y' | 'z'
 *   mirrorPair(mf, axis)        — original + mirror, unioned
 *
 * Arrays:
 *   linearArray(mf, count, step)
 *     count copies along step vector [dx, dy, dz] (or {x, y, z}).
 *   polarArray(mf, count, opts?)
 *     count copies around an axis. opts: { axis='z', total=360, center=[0,0,0] }.
 *   gridArray(mf, cols, rows, stepX, stepY)
 *     cols × rows copies on the XY plane.
 *   distribute(mf, count, from, to)
 *     count copies evenly spaced between two points.
 *
 * Positioning:
 *   at(mf, p)                   — translate to an anchor or [x,y,z]
 *   rotateAround(mf, axis, deg, pivot)
 *                                 rotate around an arbitrary pivot
 *
 * Combining:
 *   unionMany(arr)
 *   subtractMany(base, arr)
 *   intersectMany(arr)
 *
 * Inspection:
 *   bbox(mf)                    — { min, max, size, center } as 3-tuples
 *   centerOn(mf, axes='xyz')    — center the bbox on the chosen axes
 */
const { Manifold } = m;

function asVec(p) {
  if (Array.isArray(p)) return [p[0] || 0, p[1] || 0, p[2] || 0];
  if (p && typeof p === 'object') return [p.x || 0, p.y || 0, p.z || 0];
  return [0, 0, 0];
}

function mirror(mf, axis) {
  const s = axis === 'x' ? [-1, 1, 1] : axis === 'y' ? [1, -1, 1] : [1, 1, -1];
  return mf.scale(s);
}
function mirrorPair(mf, axis) { return mf.add(mirror(mf, axis)); }

function linearArray(mf, count, step) {
  const s = asVec(step);
  let r = mf;
  for (let i = 1; i < count; i++) {
    r = r.add(mf.translate([s[0] * i, s[1] * i, s[2] * i]));
  }
  return r;
}

function polarArray(mf, count, opts) {
  opts = opts || {};
  const axis = opts.axis || 'z';
  const total = opts.total != null ? opts.total : 360;
  const center = asVec(opts.center || [0, 0, 0]);
  const inc = total / count;
  let r = mf;
  for (let i = 1; i < count; i++) {
    const a = inc * i;
    const rot = axis === 'x' ? [a, 0, 0] : axis === 'y' ? [0, a, 0] : [0, 0, a];
    const inst = mf.translate([-center[0], -center[1], -center[2]]).rotate(rot).translate(center);
    r = r.add(inst);
  }
  return r;
}

function gridArray(mf, cols, rows, sx, sy) {
  let r = null;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const t = mf.translate([col * sx, row * sy, 0]);
      r = r ? r.add(t) : t;
    }
  }
  return r;
}

function distribute(mf, count, from, to) {
  const a = asVec(from), b = asVec(to);
  if (count < 2) return mf.translate(a);
  let r = null;
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    const p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const inst = mf.translate(p);
    r = r ? r.add(inst) : inst;
  }
  return r;
}

function at(mf, p) { return mf.translate(asVec(p)); }

function rotateAround(mf, axis, angle, pivot) {
  const p = asVec(pivot);
  const r = axis === 'x' ? [angle, 0, 0] : axis === 'y' ? [0, angle, 0] : [0, 0, angle];
  return mf.translate([-p[0], -p[1], -p[2]]).rotate(r).translate(p);
}

function unionMany(arr) {
  if (!arr || !arr.length) throw new Error('unionMany: empty array');
  return arr.reduce((a, b) => a.add(b));
}
function subtractMany(base, arr) {
  return (arr || []).reduce((a, b) => a.subtract(b), base);
}
function intersectMany(arr) {
  if (!arr || !arr.length) throw new Error('intersectMany: empty array');
  return arr.reduce((a, b) => a.intersect(b));
}

function bbox(mf) {
  const mesh = mf.getMesh();
  const v = mesh.vertProperties;
  const s = mesh.numProp;
  let mnX = Infinity, mnY = Infinity, mnZ = Infinity;
  let mxX = -Infinity, mxY = -Infinity, mxZ = -Infinity;
  for (let i = 0; i < v.length; i += s) {
    if (v[i] < mnX) mnX = v[i]; if (v[i] > mxX) mxX = v[i];
    if (v[i + 1] < mnY) mnY = v[i + 1]; if (v[i + 1] > mxY) mxY = v[i + 1];
    if (v[i + 2] < mnZ) mnZ = v[i + 2]; if (v[i + 2] > mxZ) mxZ = v[i + 2];
  }
  return {
    min: [mnX, mnY, mnZ],
    max: [mxX, mxY, mxZ],
    size: [mxX - mnX, mxY - mnY, mxZ - mnZ],
    center: [(mnX + mxX) / 2, (mnY + mxY) / 2, (mnZ + mxZ) / 2],
  };
}

function centerOn(mf, axes) {
  axes = axes || 'xyz';
  const b = bbox(mf);
  const t = [0, 0, 0];
  if (axes.includes('x')) t[0] = -b.center[0];
  if (axes.includes('y')) t[1] = -b.center[1];
  if (axes.includes('z')) t[2] = -b.center[2];
  return mf.translate(t);
}

return {
  mirror, mirrorPair,
  linearArray, polarArray, gridArray, distribute,
  at, rotateAround,
  unionMany, subtractMany, intersectMany,
  bbox, centerOn,
};
`;

const SHAPES = `
/**
 * shapes — common parametric shapes.
 *
 *   slot(length, width, depth)        — pill / rounded rectangle, length along X, centered
 *   tube(outer, inner, height)        — hollow cylinder, base at z=0
 *   hex(flatToFlat, height)           — hexagonal prism, flat-to-flat width
 *   cone(radius, height, segments=32)
 *   washer(outerDia, innerDia, thickness)  — alias for tube with friendly args
 *   countersink(holeDia, headDia, depth)   — straight hole + conical countersink
 *   roundedBox(size, radius, segments=16)  — box with rounded corners via hull of spheres
 *   chamferedBox(size, chamfer)            — box with 45° chamfered corners via hull
 *   loft(profiles)                         — sweep through {section, z, scale?, rotate?, x?, y?}
 *   textShape(text, opts)                  — extruded text (opts: size, depth, font, resolution)
 */
const { Manifold } = m;

function tube(outer, inner, height) {
  const o = Manifold.cylinder(height, outer / 2, outer / 2, 64);
  const i = Manifold.cylinder(height + 0.4, inner / 2, inner / 2, 64).translate([0, 0, -0.2]);
  return o.subtract(i);
}

function washer(outerDia, innerDia, thickness) {
  return tube(outerDia, innerDia, thickness);
}

function hex(flatToFlat, height) {
  const r = flatToFlat / Math.sqrt(3); // circumradius for given flat-to-flat
  return Manifold.cylinder(height, r, r, 6);
}

function cone(radius, height, segments) {
  return Manifold.cylinder(height, radius, 0, segments || 32);
}

function slot(length, width, depth) {
  const r = width / 2;
  const inner = Math.max(0, length - width);
  const body = Manifold.cube([inner, width, depth], true);
  const a = Manifold.cylinder(depth, r, r, 32, true).translate([-inner / 2, 0, 0]);
  const b = Manifold.cylinder(depth, r, r, 32, true).translate([ inner / 2, 0, 0]);
  return body.add(a).add(b);
}

function countersink(holeDia, headDia, depth) {
  const shaft = Manifold.cylinder(depth + 10, holeDia / 2, holeDia / 2, 32).translate([0, 0, -10]);
  const head  = Manifold.cylinder(depth, holeDia / 2, headDia / 2, 32);
  return shaft.add(head);
}

function asVec3(p, d) {
  d = d || 0;
  if (typeof p === 'number') return [p, p, p];
  if (Array.isArray(p)) return [p[0] || d, p[1] || d, p[2] || d];
  if (p && typeof p === 'object') return [p.x || d, p.y || d, p.z || d];
  return [d, d, d];
}

function roundedBox(size, radius, segments) {
  const s = asVec3(size);
  const r = Math.max(0.001, Math.min(radius, s[0] / 2, s[1] / 2, s[2] / 2));
  const seg = segments || 16;
  const dx = s[0] / 2 - r, dy = s[1] / 2 - r, dz = s[2] / 2 - r;
  const balls = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    balls.push(Manifold.sphere(r, seg).translate([sx * dx, sy * dy, sz * dz]));
  }
  return Manifold.hull(balls);
}

function chamferedBox(size, chamfer) {
  const s = asVec3(size);
  const c = Math.max(0.001, Math.min(chamfer, s[0] / 2, s[1] / 2, s[2] / 2));
  const hx = s[0] / 2, hy = s[1] / 2, hz = s[2] / 2;
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    pts.push([sx * (hx - c), sy * hy,       sz * hz      ]);
    pts.push([sx * hx,       sy * (hy - c), sz * hz      ]);
    pts.push([sx * hx,       sy * hy,       sz * (hz - c)]);
  }
  return Manifold.hull(pts);
}

function loft(profiles, eps) {
  if (!profiles || profiles.length < 2) throw new Error('loft: need >= 2 profiles');
  eps = eps || 0.01;
  const slabs = profiles.map(function (p, i) {
    if (!p || !p.section) throw new Error('loft: profile ' + i + ' missing .section');
    let mf = p.section.extrude(eps);
    if (p.scale != null) mf = mf.scale(typeof p.scale === 'number' ? [p.scale, p.scale, 1] : asVec3(p.scale, 1));
    if (p.rotate != null) mf = mf.rotate(asVec3(p.rotate));
    const z = (p.z || 0) - eps / 2;
    mf = mf.translate([p.x || 0, p.y || 0, z]);
    return mf;
  });
  let result = null;
  for (let i = 0; i < slabs.length - 1; i++) {
    const seg = Manifold.hull([slabs[i], slabs[i + 1]]);
    result = result ? result.add(seg) : seg;
  }
  return result;
}

// Rasterize text via canvas, trace boundary contours, extrude.
function textShape(text, opts) {
  opts = opts || {};
  const size = opts.size || 10;          // mm cap height target
  const depth = opts.depth || 1;
  const font = opts.font || 'bold sans-serif';
  const pxPerMm = opts.resolution || 8;
  const fontPx = Math.max(8, Math.round(size * pxPerMm));

  const canvas = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(8, 8)
    : document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  ctx.font = fontPx + 'px ' + font;
  const metrics = ctx.measureText(text);
  const pad = 4;
  const asc = Math.ceil(metrics.actualBoundingBoxAscent || fontPx);
  const desc = Math.ceil(metrics.actualBoundingBoxDescent || fontPx * 0.25);
  const w = Math.max(2, Math.ceil(metrics.width) + pad * 2);
  const h = asc + desc + pad * 2;
  canvas.width = w; canvas.height = h;
  ctx = canvas.getContext('2d');
  ctx.font = fontPx + 'px ' + font;
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, pad, asc + pad);

  const img = ctx.getImageData(0, 0, w, h);
  const a = img.data;
  // Binary mask: 1 if alpha > 128. Padded by 1 to simplify edge handling.
  const W = w + 2, H = h + 2;
  const mask = new Uint8Array(W * H);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (a[(y * w + x) * 4 + 3] > 128) mask[(y + 1) * W + (x + 1)] = 1;
  }

  // Marching squares: collect horizontal/vertical segments along pixel borders.
  // For each 2x2 cell, edges where one side is on and the other off become
  // boundary segments. Then chain segments into closed loops.
  // Segments stored as a multimap keyed by start vertex (vx, vy at pixel grid).
  const startMap = new Map();
  function key(x, y) { return x * 100000 + y; }
  function addSeg(x1, y1, x2, y2) {
    const k = key(x1, y1);
    let arr = startMap.get(k);
    if (!arr) { arr = []; startMap.set(k, arr); }
    arr.push([x2, y2]);
  }
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      const tl = mask[y * W + x];
      const tr = mask[y * W + x + 1];
      const bl = mask[(y + 1) * W + x];
      const br = mask[(y + 1) * W + x + 1];
      // Each segment direction is oriented so filled side is on the left
      // (CCW for outer contours, CW for holes — CrossSection.ofPolygons
      // with default fillRule handles both).
      if (tl !== tr) {
        if (tl) addSeg(x + 1, y, x + 1, y + 1); else addSeg(x + 1, y + 1, x + 1, y);
      }
      if (tr !== br) {
        if (tr) addSeg(x + 2, y + 1, x + 1, y + 1); else addSeg(x + 1, y + 1, x + 2, y + 1);
      }
      if (br !== bl) {
        if (br) addSeg(x + 1, y + 2, x + 1, y + 1); else addSeg(x + 1, y + 1, x + 1, y + 2);
      }
      if (bl !== tl) {
        if (bl) addSeg(x, y + 1, x + 1, y + 1); else addSeg(x + 1, y + 1, x, y + 1);
      }
    }
  }

  // Chain segments into closed loops.
  const loops = [];
  while (startMap.size) {
    const it = startMap.entries().next().value;
    const [startKey, firstList] = it;
    const startX = Math.floor(startKey / 100000);
    const startY = startKey - startX * 100000;
    const loop = [[startX, startY]];
    let cx = startX, cy = startY;
    let next = firstList.pop();
    if (firstList.length === 0) startMap.delete(startKey);
    let guard = 0;
    while (next && guard++ < 1000000) {
      cx = next[0]; cy = next[1];
      if (cx === startX && cy === startY) break;
      loop.push([cx, cy]);
      const k = key(cx, cy);
      const arr = startMap.get(k);
      if (!arr || arr.length === 0) break;
      next = arr.pop();
      if (arr.length === 0) startMap.delete(k);
    }
    if (loop.length >= 3) loops.push(loop);
  }

  // Simplify collinear runs (every same-direction step collapses).
  function simplify(loop) {
    const out = [];
    for (let i = 0; i < loop.length; i++) {
      const a = loop[(i - 1 + loop.length) % loop.length];
      const b = loop[i];
      const c = loop[(i + 1) % loop.length];
      const dx1 = b[0] - a[0], dy1 = b[1] - a[1];
      const dx2 = c[0] - b[0], dy2 = c[1] - b[1];
      if (dx1 * dy2 !== dx2 * dy1) out.push(b);
    }
    return out.length >= 3 ? out : loop;
  }

  // Convert pixel coords (px from top-left, including 1px pad) to mm, y-up.
  const polys = loops.map(function (loop) {
    const s = simplify(loop);
    return s.map(function (p) {
      return [(p[0] - 1 - pad) / pxPerMm, (h - (p[1] - 1 - pad)) / pxPerMm];
    });
  });

  if (!polys.length) throw new Error('textShape: empty');
  const cs = m.CrossSection.ofPolygons(polys);
  return cs.extrude(depth);
}

return { slot, tube, washer, hex, cone, countersink, roundedBox, chamferedBox, loft, textShape };
`;

const CURVES = `
/**
 * curves — bezier sampling and curve-based primitives.
 *
 *   bezier(controls, t)              — eval one point on a bezier of any order (de Casteljau)
 *   sampleBezier(controls, samples)  — evenly sample a single bezier; returns Vec3[]
 *   sampleBezierPath(segments, samplesPerSeg)
 *                                      chain of beziers sharing endpoints; segments is an array
 *                                      of control-point arrays. Returns Vec3[] (no duplicate joins).
 *   bezierTube(controls, radius, samples=32, sphereSegs=12)
 *                                      thick curve along a 3D bezier, built as hull pairs
 *                                      between successive spheres. Returns a Manifold.
 *   bezierProfile(controls2d, samples=64, closed=true)
 *                                      sample a 2D bezier into a CrossSection (single contour).
 *
 * Controls are arrays of points. A point is [x, y] or [x, y, z], or {x,y,z}.
 * The bezier order = controls.length - 1 (3 controls = quadratic, 4 = cubic, etc).
 */
const { Manifold, CrossSection } = m;

function _pt(p) {
  if (Array.isArray(p)) return [p[0] || 0, p[1] || 0, p[2] || 0];
  if (p && typeof p === 'object') return [p.x || 0, p.y || 0, p.z || 0];
  return [0, 0, 0];
}

function bezier(controls, t) {
  let pts = controls.map(_pt);
  while (pts.length > 1) {
    const next = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      next.push([
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
      ]);
    }
    pts = next;
  }
  return pts[0];
}

function sampleBezier(controls, samples) {
  const n = Math.max(2, samples || 32);
  const out = [];
  for (let i = 0; i < n; i++) out.push(bezier(controls, i / (n - 1)));
  return out;
}

function sampleBezierPath(segments, samplesPerSeg) {
  const n = Math.max(2, samplesPerSeg || 16);
  const out = [];
  segments.forEach(function (seg, idx) {
    const start = idx === 0 ? 0 : 1; // skip duplicate join
    for (let i = start; i < n; i++) out.push(bezier(seg, i / (n - 1)));
  });
  return out;
}

function bezierTube(controls, radius, samples, sphereSegs) {
  const pts = sampleBezier(controls, samples || 32);
  const seg = sphereSegs || 12;
  const balls = pts.map(function (p) { return Manifold.sphere(radius, seg).translate(p); });
  let result = null;
  for (let i = 0; i < balls.length - 1; i++) {
    const hull = Manifold.hull([balls[i], balls[i + 1]]);
    result = result ? result.add(hull) : hull;
  }
  return result;
}

function bezierProfile(controls2d, samples, closed) {
  const pts = sampleBezier(controls2d, samples || 64).map(function (p) { return [p[0], p[1]]; });
  if (closed === false) {
    // Open curve isn't a valid CrossSection; close it back along the polyline.
    // Caller usually wants closed === true (the default).
  }
  return CrossSection.ofPolygons([pts]);
}

return { bezier, sampleBezier, sampleBezierPath, bezierTube, bezierProfile };
`;

const FILLET = `
/**
 * fillet — slice-based edge rounding/chamfering driven by an oriented box anchor.
 *
 * Handles both outer (convex) and inner (concave) edges. For each corner
 * detected in a slice, a 2D profile polygon is built — either an arc-bounded
 * round or a straight-line wedge bevel — tangent to both adjacent faces.
 * Convex-corner profiles sit on the solid side and get SUBTRACTED (chamfers
 * the outer edge). Concave-corner profiles sit on the empty side and get
 * UNIONED (fills the inner edge). Toggle each operation with opts.subtract
 * and opts.add.
 *
 *   findEdgeChain(meshOrMf, box, opts?) -> Vec3[] (corner points, world)
 *   chamferEdge(meshOrMf, box, radius, opts?) -> Manifold
 *
 * Edge length is auto-detected: each chain ends where its corner stops
 * appearing in non-empty slices. The box's sz acts as a MAX search range —
 * make it generous and the chamfer fits the actual edge automatically.
 *
 * opts: {
 *   subtract?: boolean      // chamfer convex (outer) edges. Default true.
 *   add?: boolean           // fillet concave (inner) edges. Default false.
 *   profile?: 'round'|'wedge'  // arc fillet (default) or flat bevel.
 *   axes?: ('x'|'y'|'z')[]  // box-local axes to sweep along (default ['z']).
 *                            // ['x','y','z'] processes all edges. Sign
 *                            // prefixes like '+x'/'-x' are accepted (no-op).
 *   step?: number          // target endpoint precision in mm (default 2).
 *                            // Auto-extent endpoints are accurate to ~step.
 *   coarseStep?: number    // coarse pre-sampling step (default max(step*5, 1)).
 *                            // Lower = more slices but safer for finely curved
 *                            // edges; higher = faster but may miss short edges.
 *   samples?: number       // override coarseStep with a fixed coarse sample count
 *   arcSegs?: number       // arc tessellation (default 12)
 *   minTurn?: number       // min corner turn angle in degrees (default 15)
 *   matchTolerance?: number // max XY drift between consecutive slices (default max(2*r, 2))
 *   eps?: number           // slab thickness for hull-pair sweeping (default 0.05)
 *   cornerBlend?: boolean  // smooth corner blends. Default true. Affects:
 *                            //  - convex: at each cluster of meeting convex
 *                            //    chain endpoints, subtract pyramid =
 *                            //    (cornerBox − ⋃ local-cylinders) and union
 *                            //    a rolling-ball sphere of radius r at
 *                            //    centroid + Σ r·inward_unit. The ball is
 *                            //    tangent to each chamfer cylinder along a
 *                            //    great circle → C¹-smooth blend.
 *                            //  - concave (round profile only): trim each
 *                            //    chain endpoint inward by radius and place a
 *                            //    clipped sphere at the trim point, tangentially
 *                            //    extending the cylinder cap to a point on the
 *                            //    mesh face.
 *                            //  - mixed: subtract is excluded from add territory
 *                            //    so add wins at shared vertices.
 * }
 */
const { Manifold } = m;

function _mf(x) { return (x && x.manifold) ? x.manifold : x; }

function _rotateXYZ(p, rxDeg, ryDeg, rzDeg) {
  const d = Math.PI / 180;
  let x = p[0], y = p[1], z = p[2];
  const cx = Math.cos(rxDeg * d), sx = Math.sin(rxDeg * d);
  let y1 = y * cx - z * sx, z1 = y * sx + z * cx;
  y = y1; z = z1;
  const cy = Math.cos(ryDeg * d), sy = Math.sin(ryDeg * d);
  let x2 = x * cy + z * sy, z2 = -x * sy + z * cy;
  x = x2; z = z2;
  const cz = Math.cos(rzDeg * d), sz = Math.sin(rzDeg * d);
  let x3 = x * cz - y * sz, y3 = x * sz + y * cz;
  return [x3, y3, z];
}

function _boxFrame(box) {
  return {
    cx: box.x || 0, cy: box.y || 0, cz: box.z || 0,
    rx: box.rx || 0, ry: box.ry || 0, rz: box.rz || 0,
    hx: (box.sx || 10) / 2, hy: (box.sy || 10) / 2, hz: (box.sz || 10) / 2,
  };
}

// Transform mesh from world into box-local space (inverse of box transform).
function _toBoxLocal(mf, f) {
  return mf
    .translate([-f.cx, -f.cy, -f.cz])
    .rotate([0, 0, -f.rz])
    .rotate([0, -f.ry, 0])
    .rotate([-f.rx, 0, 0]);
}

// Apply box transform: local -> world.
function _toWorld(mf, f) {
  return mf
    .rotate([f.rx, 0, 0])
    .rotate([0, f.ry, 0])
    .rotate([0, 0, f.rz])
    .translate([f.cx, f.cy, f.cz]);
}

// Find ALL corners per slice (above the minTurn threshold and inside the box
// footprint). Returns an array of slices; each slice is an array of corners:
//   { z, corner:[x,y], inDir, outDir, sinCross, sliceIndex }
// sinCross > 0 means convex (CCW left turn), < 0 means concave.
function _findAllCorners(localMf, f, samples, minTurnRad) {
  const slices = [];
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0.5 : i / (samples - 1);
    const zLocal = -f.hz + t * (f.hz * 2);
    let cs;
    try { cs = localMf.slice(zLocal); } catch (e) { slices.push([]); continue; }
    if (!cs || cs.isEmpty()) { slices.push([]); continue; }
    const polys = cs.toPolygons();
    const found = [];
    for (const poly of polys) {
      const n = poly.length;
      if (n < 3) continue;
      for (let j = 0; j < n; j++) {
        const p = poly[j];
        const px = p[0], py = p[1];
        if (Math.abs(px) > f.hx || Math.abs(py) > f.hy) continue;
        const prev = poly[(j - 1 + n) % n];
        const next = poly[(j + 1) % n];
        const ix = px - prev[0], iy = py - prev[1];
        const ox = next[0] - px, oy = next[1] - py;
        const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
        if (li < 1e-6 || lo < 1e-6) continue;
        const cos = (ix * ox + iy * oy) / (li * lo);
        const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
        if (turn < minTurnRad) continue;
        const inDir = [ix / li, iy / li];
        const outDir = [ox / lo, oy / lo];
        const sinCross = inDir[0] * outDir[1] - inDir[1] * outDir[0];
        found.push({ z: zLocal, sliceIndex: i, corner: [px, py], inDir, outDir, sinCross });
      }
    }
    slices.push(found);
  }
  return slices;
}

// Greedy nearest-neighbor matching of corners across slices. Empty slices
// (slice() failed or returned no corners) are skipped — chains carry the
// previous non-empty slice forward, so transient gaps don't break edges.
// A chain genuinely ends when a NON-empty slice produces no matching corner.
function _groupChains(slices, tolerance) {
  const chains = [];
  let prevCorners = [];
  let prevChainIdx = [];

  for (let i = 0; i < slices.length; i++) {
    const curr = slices[i];
    if (curr.length === 0) continue;

    const currChainIdx = new Array(curr.length).fill(-1);
    const usedPrev = new Array(prevCorners.length).fill(false);

    for (let j = 0; j < curr.length; j++) {
      const c = curr[j];
      let bestK = -1, bestD = tolerance;
      for (let k = 0; k < prevCorners.length; k++) {
        if (usedPrev[k]) continue;
        const p = prevCorners[k];
        const dx = c.corner[0] - p.corner[0];
        const dy = c.corner[1] - p.corner[1];
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; bestK = k; }
      }
      if (bestK >= 0) {
        const chainIdx = prevChainIdx[bestK];
        chains[chainIdx].push(c);
        currChainIdx[j] = chainIdx;
        usedPrev[bestK] = true;
      } else {
        const chainIdx = chains.length;
        chains.push([c]);
        currChainIdx[j] = chainIdx;
      }
    }
    prevCorners = curr;
    prevChainIdx = currChainIdx;
  }
  return chains;
}

// 2D corner profile bounded by the two face directions at the corner.
//   profile='round' → inscribed-arc fillet/round.
//   profile='wedge' → straight line p1→p2, a flat bevel/chamfer.
// In either case the polygon sits on the "pointy" side of the corner — the
// solid side for convex corners (subtract removes it), the empty side for
// concave corners (union fills it in).
function _profilePolygon(corner, inDir, outDir, radius, arcSegs, profile) {
  const ax = -inDir[0], ay = -inDir[1];
  const bx = outDir[0], by = outDir[1];
  const cosAng = Math.max(-1, Math.min(1, ax * bx + ay * by));
  const theta = Math.acos(cosAng);
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return null;

  const t = radius / Math.tan(theta / 2);
  const p1 = [corner[0] + ax * t, corner[1] + ay * t];
  const p2 = [corner[0] + bx * t, corner[1] + by * t];

  let poly;
  if (profile === 'wedge') {
    poly = [[corner[0], corner[1]], p1, p2];
  } else {
    const d = radius / Math.sin(theta / 2);
    const bisX = ax + bx, bisY = ay + by;
    const blen = Math.hypot(bisX, bisY);
    if (blen < 1e-6) return null;
    const cx = corner[0] + (bisX / blen) * d;
    const cy = corner[1] + (bisY / blen) * d;

    poly = [[corner[0], corner[1]], p1];
    const a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
    const a2 = Math.atan2(p2[1] - cy, p2[0] - cx);
    let da = a2 - a1;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    for (let i = 1; i < arcSegs; i++) {
      const ang = a1 + da * (i / arcSegs);
      poly.push([cx + radius * Math.cos(ang), cy + radius * Math.sin(ang)]);
    }
    poly.push(p2);
  }

  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const pa = poly[i], pb = poly[(i + 1) % poly.length];
    area += pa[0] * pb[1] - pb[0] * pa[1];
  }
  if (area < 0) poly.reverse();
  return poly;
}

// Pre-rotation that takes a box-local axis to the slice axis (Z), and its
// inverse. Sign ('+x' vs '-x') doesn't affect detection results — slicing
// is direction-agnostic — so we strip the sign.
function _axisPreRot(axis) {
  switch (axis) {
    case 'x': return [0, -90, 0];
    case 'y': return [90, 0, 0];
    case 'z': return [0, 0, 0];
    default: throw new Error('chamferEdge: unknown axis "' + axis + '"');
  }
}
function _axisInvRot(axis) {
  switch (axis) {
    case 'x': return [0, 90, 0];
    case 'y': return [-90, 0, 0];
    case 'z': return [0, 0, 0];
    default: throw new Error('chamferEdge: unknown axis "' + axis + '"');
  }
}
// Box dimensions remapped into slice-local space for this axis.
function _dimsForAxis(f, axis) {
  switch (axis) {
    case 'x': return { hx: f.hz, hy: f.hy, hz: f.hx };
    case 'y': return { hx: f.hx, hy: f.hz, hz: f.hy };
    case 'z': return { hx: f.hx, hy: f.hy, hz: f.hz };
    default: throw new Error('chamferEdge: unknown axis "' + axis + '"');
  }
}
function _normalizeAxis(a) {
  const s = String(a).toLowerCase().replace(/^[+-]/, '');
  if (s !== 'x' && s !== 'y' && s !== 'z') {
    throw new Error('chamferEdge: bad axis "' + a + '"');
  }
  return s;
}

function findEdgeChain(meshOrMf, box, opts) {
  opts = opts || {};
  const samples = opts.samples || 12;
  const minTurnRad = (opts.minTurn != null ? opts.minTurn : 15) * Math.PI / 180;
  if (!box || box.kind !== 'box') throw new Error('findEdgeChain: anchor must be a box anchor');
  const f = _boxFrame(box);
  const local = _toBoxLocal(_mf(meshOrMf), f);
  const slices = _findAllCorners(local, f, samples, minTurnRad);
  const flat = [];
  for (const slice of slices) for (const c of slice) flat.push(c);
  return flat.map(function (c) {
    const r = _rotateXYZ([c.corner[0], c.corner[1], c.z], f.rx, f.ry, f.rz);
    return [r[0] + f.cx, r[1] + f.cy, r[2] + f.cz];
  });
}

// Run-length encode the chain: group consecutive corners with near-identical
// position and direction vectors into runs. Each run becomes ONE extruded
// slab covering the run's full z extent. Hull-pairs only bridge between
// runs where the corner actually moved. For a prism (straight) edge with
// hundreds of identical samples this collapses to a single extruded slab.
function _buildChainWedge(chain, radius, arcSegs, eps, profile) {
  if (!chain.length) return null;
  const posEps = 0.02;  // mm
  const dirEps = 0.02;  // unit vector components
  function sameProfile(a, b) {
    if (Math.hypot(a.corner[0] - b.corner[0], a.corner[1] - b.corner[1]) >= posEps) return false;
    if (Math.hypot(a.inDir[0] - b.inDir[0], a.inDir[1] - b.inDir[1]) >= dirEps) return false;
    if (Math.hypot(a.outDir[0] - b.outDir[0], a.outDir[1] - b.outDir[1]) >= dirEps) return false;
    return true;
  }

  const runs = [[chain[0]]];
  for (let i = 1; i < chain.length; i++) {
    const prevRun = runs[runs.length - 1];
    if (sameProfile(prevRun[0], chain[i])) prevRun.push(chain[i]);
    else runs.push([chain[i]]);
  }

  const slabs = [];
  for (const run of runs) {
    const first = run[0];
    const last = run[run.length - 1];
    const poly = _profilePolygon(first.corner, first.inDir, first.outDir, radius, arcSegs, profile);
    if (!poly) continue;
    const cs = m.CrossSection.ofPolygons([poly]);
    const height = Math.max(eps, last.z - first.z + eps);
    const slab = cs.extrude(height).translate([0, 0, first.z - eps / 2]);
    slabs.push(slab);
  }
  if (!slabs.length) return null;
  if (slabs.length === 1) return slabs[0];

  // Hull(slab_i, slab_{i+1}) contains both, so unioning consecutive hulls
  // covers all slabs plus the transition volumes between them.
  let wedge = null;
  for (let i = 0; i < slabs.length - 1; i++) {
    const seg = Manifold.hull([slabs[i], slabs[i + 1]]);
    wedge = wedge ? wedge.add(seg) : seg;
  }
  return wedge;
}

// Round-profile arc center for a corner, in slice-local XY. This is the
// position of the chamfer/fillet cylinder axis at the corner's slice. For
// concave corners, this point sits in the empty L-bend; for convex corners
// it sits inside the solid wedge.
function _arcCenter(corner, inDir, outDir, radius) {
  const ax = -inDir[0], ay = -inDir[1];
  const bx = outDir[0], by = outDir[1];
  const cosAng = Math.max(-1, Math.min(1, ax * bx + ay * by));
  const theta = Math.acos(cosAng);
  if (theta < 1e-3 || Math.PI - theta < 1e-3) return null;
  const d = radius / Math.sin(theta / 2);
  const bisX = ax + bx, bisY = ay + by;
  const blen = Math.hypot(bisX, bisY);
  if (blen < 1e-6) return null;
  return [corner[0] + (bisX / blen) * d, corner[1] + (bisY / blen) * d];
}

// Greedy BFS clustering of 3D points within \`radius\`. Returns an array of
// index groups. Two points are in the same group iff connected by a chain
// of within-radius neighbors.
function _cluster3d(pts, radius) {
  const n = pts.length;
  const group = new Array(n).fill(-1);
  const groups = [];
  const r2 = radius * radius;
  for (let i = 0; i < n; i++) {
    if (group[i] >= 0) continue;
    const gIdx = groups.length;
    groups.push([i]);
    group[i] = gIdx;
    const queue = [i];
    while (queue.length) {
      const k = queue.shift();
      for (let j = 0; j < n; j++) {
        if (group[j] >= 0) continue;
        const dx = pts[k][0] - pts[j][0];
        const dy = pts[k][1] - pts[j][1];
        const dz = pts[k][2] - pts[j][2];
        if (dx * dx + dy * dy + dz * dz < r2) {
          group[j] = gIdx;
          groups[gIdx].push(j);
          queue.push(j);
        }
      }
    }
  }
  return groups;
}

// Slice once at z and return the best corner near a reference (same XY within
// matchTol, sufficient turn angle, inside the footprint). Used by the endpoint
// binary-search refinement.
function _sliceAndFindNear(sliceLocal, dims, zLocal, refCorner, minTurnRad, matchTol) {
  let cs;
  try { cs = sliceLocal.slice(zLocal); } catch (e) { return { empty: true }; }
  if (!cs || cs.isEmpty()) return { empty: true };
  const polys = cs.toPolygons();
  let best = null, bestD = matchTol;
  for (const poly of polys) {
    const n = poly.length;
    if (n < 3) continue;
    for (let j = 0; j < n; j++) {
      const p = poly[j];
      const px = p[0], py = p[1];
      if (Math.abs(px) > dims.hx || Math.abs(py) > dims.hy) continue;
      const d = Math.hypot(px - refCorner[0], py - refCorner[1]);
      if (d > bestD) continue;
      const prev = poly[(j - 1 + n) % n];
      const next = poly[(j + 1) % n];
      const ix = px - prev[0], iy = py - prev[1];
      const ox = next[0] - px, oy = next[1] - py;
      const li = Math.hypot(ix, iy), lo = Math.hypot(ox, oy);
      if (li < 1e-6 || lo < 1e-6) continue;
      const cos = (ix * ox + iy * oy) / (li * lo);
      const turn = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (turn < minTurnRad) continue;
      const inDir = [ix / li, iy / li];
      const outDir = [ox / lo, oy / lo];
      const sinCross = inDir[0] * outDir[1] - inDir[1] * outDir[0];
      bestD = d;
      best = { corner: [px, py], inDir, outDir, sinCross };
    }
  }
  return best ? { corner: best } : { empty: false };
}

// Binary search between yesZ (corner present) and noZ (corner absent but slice
// non-empty). Returns the most refined "yes" corner, or null if no refinement
// possible. Stops when |hi - lo| <= targetStep or after maxIters.
function _refineEndpoint(sliceLocal, dims, refCornerData, yesZ, noZ, targetStep, minTurnRad, matchTol) {
  let lastYes = null;
  let lo = yesZ, hi = noZ;
  const maxIters = 10;
  for (let i = 0; i < maxIters && Math.abs(hi - lo) > targetStep; i++) {
    const mid = (lo + hi) / 2;
    const refXY = lastYes ? lastYes.corner : refCornerData.corner;
    const res = _sliceAndFindNear(sliceLocal, dims, mid, refXY, minTurnRad, matchTol);
    if (res.empty) {
      // Empty slice between non-empty endpoints is unusual; treat as 'no'.
      hi = mid;
    } else if (res.corner) {
      lastYes = { z: mid, sliceIndex: -1, ...res.corner };
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lastYes;
}

// Run the corner-finding + wedge-building pipeline along one axis.
// Operates entirely in slice-local space (z = sweep axis). Returns the
// summed wedge manifold in slice-local coords, or null if no convex edges.
function _chamferAlongAxis(sliceLocal, dims, radius, arcSegs, eps, samples, minTurnRad, matchTol, targetStep, profile, doSubtract, doAdd) {
  const slices = _findAllCorners(sliceLocal, dims, samples, minTurnRad);
  const sliceZs = [];
  for (let i = 0; i < samples; i++) {
    const t = samples === 1 ? 0.5 : i / (samples - 1);
    sliceZs.push(-dims.hz + t * (2 * dims.hz));
  }

  // Classify each chain by majority convex/concave vote, keep only wanted ones.
  const rawChains = _groupChains(slices, matchTol);
  const chains = [];
  for (const ch of rawChains) {
    let votes = 0;
    for (const c of ch) votes += c.sinCross > 0 ? 1 : -1;
    const isConvex = votes > 0;
    if ((isConvex && doSubtract) || (!isConvex && doAdd)) {
      chains.push({ corners: ch, isConvex });
    }
  }
  if (!chains.length) return { subtractWedge: null, addWedge: null, convex: 0, concave: 0 };

  function refineEnd(ch, atStart, isConvex) {
    const refEnd = atStart ? ch[0] : ch[ch.length - 1];
    const refIdx = refEnd.sliceIndex;
    const adjIdx = atStart ? refIdx - 1 : refIdx + 1;

    if (adjIdx >= 0 && adjIdx < samples) {
      const refined = _refineEndpoint(sliceLocal, dims, refEnd, refEnd.z, sliceZs[adjIdx], targetStep, minTurnRad, matchTol);
      if (refined) {
        if (atStart) ch.unshift(refined);
        else ch.push(refined);
        return;
      }
    }
    if (!isConvex) return;

    let anyNonEmpty = false;
    if (atStart) {
      for (let i = 0; i < refIdx; i++) {
        if (slices[i].length > 0) { anyNonEmpty = true; break; }
      }
    } else {
      for (let i = refIdx + 1; i < slices.length; i++) {
        if (slices[i].length > 0) { anyNonEmpty = true; break; }
      }
    }
    if (anyNonEmpty) return;

    const boundary = atStart ? -dims.hz : dims.hz;
    const needPad = atStart
      ? refEnd.z > -dims.hz + 1e-3
      : refEnd.z < dims.hz - 1e-3;
    if (needPad) {
      const padded = Object.assign({}, refEnd, { z: boundary, _padded: true });
      if (atStart) ch.unshift(padded);
      else ch.push(padded);
    }
  }

  for (const { corners: ch, isConvex } of chains) {
    refineEnd(ch, true, isConvex);
    refineEnd(ch, false, isConvex);
  }

  // For concave round-profile chains: trim the chain endpoints inward by
  // \`radius\` so the cylinder fillet stops short of the mesh face. Stash a
  // sphere at each trim point — the half facing the (now-missing) face
  // tangentially continues the cylinder, tapering to a point on the face.
  // Skip if the chain is too short to safely trim from both ends.
  const concaveEndSpheres = [];
  const sphereSegs = Math.max(arcSegs * 2, 16);
  if (profile === 'round') {
    for (const { corners: ch, isConvex } of chains) {
      if (isConvex) continue;
      if (ch.length < 2) continue;
      const chainLen = ch[ch.length - 1].z - ch[0].z;
      if (chainLen < 2.5 * radius) continue;

      // First endpoint
      if (!ch[0]._padded) {
        const orig = ch[0];
        const center = _arcCenter(orig.corner, orig.inDir, orig.outDir, radius);
        if (center) {
          const trimZ = orig.z + radius;
          const sphere = Manifold.sphere(radius, sphereSegs).translate([center[0], center[1], trimZ]);
          const HUGE = 1000;
          const clip = Manifold.cube([HUGE, HUGE, HUGE], true).translate([0, 0, orig.z + HUGE / 2]);
          let clipped;
          try { clipped = sphere.intersect(clip); } catch (e) { clipped = null; }
          if (clipped) concaveEndSpheres.push(clipped);
          ch[0] = Object.assign({}, orig, { z: trimZ });
        }
      }
      // Last endpoint
      const lastIdx = ch.length - 1;
      if (!ch[lastIdx]._padded) {
        const orig = ch[lastIdx];
        const center = _arcCenter(orig.corner, orig.inDir, orig.outDir, radius);
        if (center) {
          const trimZ = orig.z - radius;
          const sphere = Manifold.sphere(radius, sphereSegs).translate([center[0], center[1], trimZ]);
          const HUGE = 1000;
          const clip = Manifold.cube([HUGE, HUGE, HUGE], true).translate([0, 0, orig.z - HUGE / 2]);
          let clipped;
          try { clipped = sphere.intersect(clip); } catch (e) { clipped = null; }
          if (clipped) concaveEndSpheres.push(clipped);
          ch[lastIdx] = Object.assign({}, orig, { z: trimZ });
        }
      }
    }
  }

  let subtractTotal = null, addTotal = null;
  let convexCount = 0, concaveCount = 0;
  const convexEndpoints = [];
  const cylSegs = Math.max(arcSegs * 2, 16);
  const cylLength = 6 * radius;
  for (const { corners, isConvex } of chains) {
    const w = _buildChainWedge(corners, radius, arcSegs, eps, profile);
    if (!w) continue;
    if (isConvex) {
      subtractTotal = subtractTotal ? subtractTotal.add(w) : w;
      convexCount++;
      // Collect non-padded endpoint data for cross-axis vertex blending via
      // explicit pyramid + rolling-ball construction. For each endpoint we
      // record the chamfer cylinder axis (arc center xy + chain z) and the
      // inward direction (+z or -z in slice-local) so the chamferEdge stage
      // can build a corner volume and a tangent rolling ball.
      const firstNP = corners.find(function (c) { return !c._padded; });
      const lastNP = corners.slice().reverse().find(function (c) { return !c._padded; });
      const ends = [];
      if (firstNP) ends.push({ end: firstNP, inwardZ: 1 });
      if (lastNP && lastNP !== firstNP) ends.push({ end: lastNP, inwardZ: -1 });
      for (const { end, inwardZ } of ends) {
        const arcXY = _arcCenter(end.corner, end.inDir, end.outDir, radius);
        if (!arcXY) continue;
        const cyl = Manifold.cylinder(cylLength, radius, radius, cylSegs, true)
          .translate([arcXY[0], arcXY[1], end.z]);
        convexEndpoints.push({ corner: end.corner, z: end.z, inwardZ, cyl });
      }
    } else {
      addTotal = addTotal ? addTotal.add(w) : w;
      concaveCount++;
    }
  }
  return { subtractWedge: subtractTotal, addWedge: addTotal, convex: convexCount, concave: concaveCount, convexEndpoints, concaveEndSpheres };
}

function chamferEdge(meshOrMf, box, radius, opts) {
  opts = opts || {};
  const minTurnRad = (opts.minTurn != null ? opts.minTurn : 15) * Math.PI / 180;
  const arcSegs = opts.arcSegs || 12;
  const eps = opts.eps || 0.05;
  const matchTol = opts.matchTolerance != null ? opts.matchTolerance : Math.max(radius * 2, 2);

  if (!box || box.kind !== 'box') throw new Error('chamferEdge: anchor must be a box anchor');
  const mf = _mf(meshOrMf);
  const f = _boxFrame(box);
  const boxLocal = _toBoxLocal(mf, f);

  // Axes to sweep. Default ['z'] = original behavior. ['x','y','z'] = all.
  // Sign prefixes ('+x', '-x') are accepted and stripped — sweep is direction-
  // agnostic. Duplicates are deduped.
  const axesIn = Array.isArray(opts.axes) ? opts.axes : ['z'];
  const axes = Array.from(new Set(axesIn.map(_normalizeAxis)));

  // Operation toggles. subtract = chamfer outer (convex) edges. add = fillet
  // inner (concave) edges. Default: subtract on, add off (back-compat).
  const doSubtract = opts.subtract !== false;
  const doAdd = !!opts.add;
  if (!doSubtract && !doAdd) {
    console.warn('chamferEdge: both subtract and add are off — nothing to do');
    return mf;
  }

  // Profile shape: 'round' (arc, default) or 'wedge' (flat bevel).
  const profile = opts.profile === 'wedge' ? 'wedge' : 'round';

  const targetStep = opts.step || 2;
  const coarseStep = opts.coarseStep || Math.max(targetStep * 5, 1);
  const doCornerBlend = opts.cornerBlend !== false;

  let subtractTotal = null, addTotal = null;
  const counts = {};
  const allConvexEndpoints = [];
  for (const axis of axes) {
    const preRot = _axisPreRot(axis);
    const invRot = _axisInvRot(axis);
    const dims = _dimsForAxis(f, axis);
    const samples = opts.samples
      ? opts.samples
      : Math.max(2, Math.ceil((2 * dims.hz) / coarseStep) + 1);

    const sliceLocal = boxLocal.rotate(preRot);
    const res = _chamferAlongAxis(sliceLocal, dims, radius, arcSegs, eps,
                                   samples, minTurnRad, matchTol, targetStep,
                                   profile, doSubtract, doAdd);
    counts[axis] = { convex: res.convex, concave: res.concave };

    if (res.subtractWedge) {
      const w = res.subtractWedge.rotate(invRot);
      subtractTotal = subtractTotal ? subtractTotal.add(w) : w;
    }
    if (res.addWedge) {
      const w = res.addWedge.rotate(invRot);
      addTotal = addTotal ? addTotal.add(w) : w;
    }
    if (doCornerBlend && doSubtract && res.convexEndpoints) {
      for (const ep of res.convexEndpoints) {
        const pos = _rotateXYZ([ep.corner[0], ep.corner[1], ep.z], invRot[0], invRot[1], invRot[2]);
        const inward = _rotateXYZ([0, 0, ep.inwardZ], invRot[0], invRot[1], invRot[2]);
        const cyl = ep.cyl.rotate(invRot);
        allConvexEndpoints.push({ pos, inward, cyl });
      }
    }
    if (doCornerBlend && doAdd && res.concaveEndSpheres) {
      for (const sphere of res.concaveEndSpheres) {
        const s = sphere.rotate(invRot);
        addTotal = addTotal ? addTotal.add(s) : s;
      }
    }
  }

  // Cross-axis vertex blending via explicit rolling-ball construction.
  // For each cluster of meeting convex chain endpoints we build:
  //   pyramid = cornerBox - ⋃ local-cylinders     (the sharp corner artifact)
  //   ball    = sphere(r) at centroid + Σ r·inward_unit  (the rolling ball,
  //                                                       tangent to each
  //                                                       chamfer cylinder
  //                                                       along a great circle)
  // pyramid goes to subtractTotal, ball goes to addTotal. Final apply
  // protects add from subtract, so the ball survives and provides a
  // spherical blend tangent-continuous with the chamfered cylinder edges.
  let blendCount = 0;
  if (doCornerBlend && allConvexEndpoints.length >= 2) {
    const clusterRadius = Math.max(targetStep * 3, 0.5);
    const groups = _cluster3d(allConvexEndpoints.map(function (e) { return e.pos; }), clusterRadius);
    const blendSphereSegs = Math.max(arcSegs * 2, 16);
    const cbSize = 3 * radius;
    for (const group of groups) {
      if (group.length < 2) continue;

      let cx = 0, cy = 0, cz = 0;
      let bx = 0, by = 0, bz = 0;
      for (const idx of group) {
        const ep = allConvexEndpoints[idx];
        cx += ep.pos[0]; cy += ep.pos[1]; cz += ep.pos[2];
        bx += ep.inward[0]; by += ep.inward[1]; bz += ep.inward[2];
      }
      cx /= group.length; cy /= group.length; cz /= group.length;
      // Ball center = centroid offset by r along each chain's inward direction.
      const ballX = cx + radius * bx;
      const ballY = cy + radius * by;
      const ballZ = cz + radius * bz;

      const cornerBox = Manifold.cube([cbSize, cbSize, cbSize], true).translate([cx, cy, cz]);

      let cylsUnion = null;
      for (const idx of group) {
        const c = allConvexEndpoints[idx].cyl;
        cylsUnion = cylsUnion ? cylsUnion.add(c) : c;
      }

      let pyramid;
      try { pyramid = cornerBox.subtract(cylsUnion); }
      catch (e) { continue; }
      if (!pyramid) continue;

      subtractTotal = subtractTotal ? subtractTotal.add(pyramid) : pyramid;

      const ball = Manifold.sphere(radius, blendSphereSegs).translate([ballX, ballY, ballZ]);
      addTotal = addTotal ? addTotal.add(ball) : ball;

      blendCount++;
    }
  }

  if (!subtractTotal && !addTotal) {
    console.warn('chamferEdge: no matching corners found along axes [' + axes.join(',') + ']');
    return mf;
  }

  console.log('chamferEdge (' + profile + '): ' + axes.map(function (a) {
    const c = counts[a] || { convex: 0, concave: 0 };
    return a + '={' + c.convex + 'cvx,' + c.concave + 'ccv}';
  }).join(' ') + (blendCount ? ' +' + blendCount + ' vertex blend(s)' : ''));

  // Protect add territory from subtract at mixed convex/concave vertices:
  // at a corner where a concave fillet end-sphere overlaps a convex chamfer
  // hull, we want the add (smooth blend) to win, not get carved by subtract.
  // (mesh + add) - (sub - add)  =  (mesh - sub) ∪ add, so add is preserved
  // wherever it touches.
  let actualSubtract = subtractTotal;
  if (subtractTotal && addTotal) {
    try { actualSubtract = subtractTotal.subtract(addTotal); } catch (e) { actualSubtract = subtractTotal; }
  }

  let result = mf;
  if (addTotal) result = result.add(_toWorld(addTotal, f));
  if (actualSubtract) result = result.subtract(_toWorld(actualSubtract, f));
  return result;
}

return { findEdgeChain, chamferEdge };
`;

export const BUILTINS: Record<string, string> = {
  layout: LAYOUT,
  shapes: SHAPES,
  curves: CURVES,
  fillet: FILLET,
};

// Quick doc strings (top JSDoc of each module) — extracted for the help dialog.
export const BUILTIN_DOCS: Record<string, string> = {
  layout: extractDoc(LAYOUT),
  shapes: extractDoc(SHAPES),
  curves: extractDoc(CURVES),
  fillet: extractDoc(FILLET),
};

function extractDoc(src: string): string {
  const m = src.match(/\/\*\*([\s\S]*?)\*\//);
  if (!m) return '';
  return m[1]
    .split('\n')
    .map(l => l.replace(/^\s*\*\s?/, ''))
    .join('\n')
    .trim();
}
