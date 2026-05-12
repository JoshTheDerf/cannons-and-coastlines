declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const c: DefineComponent<{}, {}, any>;
  export default c;
}

declare module 'manifold-3d' {
  export type Vec3 = [number, number, number];

  export interface MeshData {
    numProp: number;
    vertProperties: Float32Array;
    triVerts: Uint32Array;
  }

  export interface Manifold {
    add(other: Manifold): Manifold;
    subtract(other: Manifold): Manifold;
    intersect(other: Manifold): Manifold;
    translate(v: Vec3): Manifold;
    rotate(v: Vec3): Manifold;
    scale(v: Vec3 | number): Manifold;
    getMesh(): MeshData;
    status(): number | string;
    delete?(): void;
  }

  export interface ManifoldCtor {
    new (mesh: MeshData | Mesh): Manifold;
    cube(size: Vec3 | number, center?: boolean): Manifold;
    sphere(radius: number, segments?: number): Manifold;
    cylinder(height: number, r1: number, r2?: number, segments?: number, center?: boolean): Manifold;
    NoError: number;
  }

  export interface Mesh {
    numProp: number;
    vertProperties: Float32Array;
    triVerts: Uint32Array;
    merge(): void;
  }

  export interface MeshCtor {
    new (data: MeshData): Mesh;
  }

  export interface ManifoldModule {
    setup(): void;
    Manifold: ManifoldCtor;
    Mesh: MeshCtor;
    [k: string]: any;
  }

  const factory: () => Promise<ManifoldModule>;
  export default factory;
}
