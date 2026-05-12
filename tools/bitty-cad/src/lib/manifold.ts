import Module from 'manifold-3d';
import type { ManifoldModule } from 'manifold-3d';
import { patchManifold } from './manifoldPatch';

let modulePromise: Promise<ManifoldModule> | null = null;

export function getManifold(): Promise<ManifoldModule> {
  if (!modulePromise) {
    modulePromise = Module().then(wasm => {
      wasm.setup();
      patchManifold(wasm);
      return wasm;
    });
  }
  return modulePromise;
}
