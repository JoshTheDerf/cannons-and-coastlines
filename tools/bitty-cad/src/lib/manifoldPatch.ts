import type { Manifold, ManifoldModule } from 'manifold-3d';

// Auto-track tool shapes used in subtract() so the ghost overlay can show
// them without users declaring `cuts: [...]` on the return value.
//
// The wasm-bound Manifold class doesn't expose its methods as own properties
// of wasm.Manifold.prototype — embind installs them further up the chain.
// So we probe a real instance, walk its prototype chain to find where each
// method actually lives, and patch it there.

const CUTS = new WeakMap<Manifold, Manifold[]>();
let patched = false;

const METHODS = ['subtract', 'add', 'intersect', 'translate', 'rotate', 'scale'] as const;
type MethodName = typeof METHODS[number];

export function patchManifold(wasm: ManifoldModule): void {
  if (patched) return;

  // Embind doesn't put Manifold methods on wasm.Manifold.prototype directly;
  // probe a real instance to find the actual prototype where they live.
  const probe = wasm.Manifold.cube([1, 1, 1]) as any;
  const found: Partial<Record<MethodName, { proto: any; orig: Function }>> = {};

  for (const name of METHODS) {
    let p: any = Object.getPrototypeOf(probe);
    let descriptor: PropertyDescriptor | undefined;
    let foundProto: any = null;
    let level = 0;
    while (p && level < 10) {
      descriptor = Object.getOwnPropertyDescriptor(p, name);
      if (descriptor) { foundProto = p; break; }
      p = Object.getPrototypeOf(p);
      level++;
    }
    if (!foundProto || !descriptor) continue;
    const orig = (descriptor.value ?? (descriptor.get ? descriptor.get.call(probe) : null)) as Function | null;
    if (typeof orig !== 'function') continue;
    found[name] = { proto: foundProto, orig };
  }

  function getCuts(m: Manifold): Manifold[] { return CUTS.get(m) ?? []; }
  function setCuts(m: Manifold, list: Manifold[]) { if (list.length) CUTS.set(m, list); }

  function install(name: MethodName, fn: (this: Manifold, ...args: any[]) => Manifold): void {
    const t = found[name];
    if (!t) return;
    Object.defineProperty(t.proto, name, {
      configurable: true,
      writable: true,
      value: fn,
    });
  }

  install('subtract', function (this: Manifold, other: Manifold) {
    const result = found.subtract!.orig.call(this, other) as Manifold;
    setCuts(result, [...getCuts(this), ...getCuts(other), other]);
    return result;
  });

  install('add', function (this: Manifold, other: Manifold) {
    const result = found.add!.orig.call(this, other) as Manifold;
    setCuts(result, [...getCuts(this), ...getCuts(other)]);
    return result;
  });

  install('intersect', function (this: Manifold, other: Manifold) {
    const result = found.intersect!.orig.call(this, other) as Manifold;
    setCuts(result, [...getCuts(this), ...getCuts(other)]);
    return result;
  });

  install('translate', function (this: Manifold, v: any) {
    const result = found.translate!.orig.call(this, v) as Manifold;
    const cuts = getCuts(this);
    if (cuts.length) {
      setCuts(result, cuts.map(c => found.translate!.orig.call(c, v) as Manifold));
    }
    return result;
  });

  install('rotate', function (this: Manifold, v: any) {
    const result = found.rotate!.orig.call(this, v) as Manifold;
    const cuts = getCuts(this);
    if (cuts.length) {
      setCuts(result, cuts.map(c => found.rotate!.orig.call(c, v) as Manifold));
    }
    return result;
  });

  install('scale', function (this: Manifold, v: any) {
    const result = found.scale!.orig.call(this, v) as Manifold;
    const cuts = getCuts(this);
    if (cuts.length) {
      setCuts(result, cuts.map(c => found.scale!.orig.call(c, v) as Manifold));
    }
    return result;
  });

  try { (probe as any).delete?.(); } catch { /* noop */ }

  patched = true;
}

export function getTrackedCuts(m: Manifold): Manifold[] {
  return CUTS.get(m) ?? [];
}
