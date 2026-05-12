// Drives Monaco's JS language service with synthetic TypeScript declarations
// so the editor offers IntelliSense for:
//   - the manifold module (m.Manifold.cube, .subtract, ...)
//   - anchors.<currentNames>
//   - meshes.<currentNames>
//   - use('<userFile | builtin>')  via overload literals
//
// The static block changes rarely; the dynamic block (anchor/mesh/file names)
// is regenerated whenever the store changes.

import type * as Monaco from 'monaco-editor';
import { store } from '../store';

const STATIC_LIB = `
declare namespace BittyCad {
  export type Vec3 = [number, number, number] | { x: number; y: number; z?: number };

  export interface MeshData {
    numProp: number;
    vertProperties: Float32Array;
    triVerts: Uint32Array;
  }

  export interface Manifold {
    /** Boolean union. */
    add(other: Manifold): Manifold;
    /** Boolean difference. The subtracted shape is auto-tracked for the ghost overlay. */
    subtract(other: Manifold): Manifold;
    /** Boolean intersection. */
    intersect(other: Manifold): Manifold;
    /** Translate by an [x, y, z] vector (mm). */
    translate(v: [number, number, number]): Manifold;
    /** Rotate by Euler angles in degrees (XYZ order). */
    rotate(v: [number, number, number]): Manifold;
    /** Scale uniformly or per-axis. */
    scale(v: [number, number, number] | number): Manifold;
    /** Extract the underlying mesh data. */
    getMesh(): MeshData;
  }

  export interface ManifoldStatic {
    new (mesh: MeshData): Manifold;
    /** Axis-aligned box. size = [x, y, z] in mm. */
    cube(size: [number, number, number] | number, center?: boolean): Manifold;
    /** UV sphere. */
    sphere(radius: number, segments?: number): Manifold;
    /** Cylinder along Z. r2 omitted → straight; r2 = 0 → cone. */
    cylinder(height: number, r1: number, r2?: number, segments?: number, center?: boolean): Manifold;
  }

  export interface ManifoldModule {
    Manifold: ManifoldStatic;
    CrossSection: any;
  }

  export interface MeshFile {
    /** Manifold form — null if the imported mesh wasn't watertight. */
    manifold: Manifold | null;
    /** Raw three.js geometry for inspection. */
    geometry: any;
    visible: boolean;
  }

  export interface AnchorPos {
    x: number; y: number; z: number;
    /** 'point' = positional only; 'box' = oriented box region with size + rotation. */
    kind: 'point' | 'box';
    /** Euler XYZ rotation in degrees (box anchors). */
    rx: number; ry: number; rz: number;
    /** Box dimensions in mm (box anchors). */
    sx: number; sy: number; sz: number;
  }

  /** Built-in layout helpers (use('layout')). */
  export interface Layout {
    /** Flip the shape along an axis. */
    mirror(mf: Manifold, axis: 'x' | 'y' | 'z'): Manifold;
    /** Shape unioned with its mirror across the chosen axis. */
    mirrorPair(mf: Manifold, axis: 'x' | 'y' | 'z'): Manifold;
    /** count copies along a step vector. */
    linearArray(mf: Manifold, count: number, step: Vec3): Manifold;
    /** count copies around an axis (default: full circle around Z). */
    polarArray(
      mf: Manifold,
      count: number,
      opts?: { axis?: 'x' | 'y' | 'z'; total?: number; center?: Vec3 },
    ): Manifold;
    /** cols x rows grid on XY. */
    gridArray(mf: Manifold, cols: number, rows: number, stepX: number, stepY: number): Manifold;
    /** count copies evenly spaced between from and to. */
    distribute(mf: Manifold, count: number, from: Vec3, to: Vec3): Manifold;
    /** Translate to an anchor or vec3. */
    at(mf: Manifold, p: Vec3): Manifold;
    /** Rotate around an arbitrary pivot. */
    rotateAround(mf: Manifold, axis: 'x' | 'y' | 'z', angle: number, pivot: Vec3): Manifold;
    unionMany(arr: Manifold[]): Manifold;
    subtractMany(base: Manifold, arr: Manifold[]): Manifold;
    intersectMany(arr: Manifold[]): Manifold;
    /** Axis-aligned bounding box. */
    bbox(mf: Manifold): { min: [number, number, number]; max: [number, number, number]; size: [number, number, number]; center: [number, number, number] };
    /** Center bounding box on selected axes ('x', 'y', 'z', or any combination). */
    centerOn(mf: Manifold, axes?: string): Manifold;
  }

  /** Built-in parametric shapes (use('shapes')). */
  export interface Shapes {
    /** Pill / rounded rectangle, length along X, centered. */
    slot(length: number, width: number, depth: number): Manifold;
    /** Hollow cylinder, base at z=0. */
    tube(outer: number, inner: number, height: number): Manifold;
    washer(outerDia: number, innerDia: number, thickness: number): Manifold;
    /** Hexagonal prism, flat-to-flat width. */
    hex(flatToFlat: number, height: number): Manifold;
    cone(radius: number, height: number, segments?: number): Manifold;
    /** Through-hole with conical countersink. */
    countersink(holeDia: number, headDia: number, depth: number): Manifold;
    /** Box with rounded corners (hull of 8 spheres). */
    roundedBox(size: Vec3 | number, radius: number, segments?: number): Manifold;
    /** Box with 45° chamfered corners (hull of 24 inset points). */
    chamferedBox(size: Vec3 | number, chamfer: number): Manifold;
    /** Sweep through a list of 2D profiles at z heights. */
    loft(profiles: Array<{ section: any; z?: number; x?: number; y?: number; scale?: Vec3 | number; rotate?: Vec3 }>, eps?: number): Manifold;
    /** Extruded text rasterized through canvas. opts: { size?, depth?, font?, resolution? }. */
    textShape(text: string, opts?: { size?: number; depth?: number; font?: string; resolution?: number }): Manifold;
  }

  /** Slice-based edge chamfering driven by a box anchor (use('fillet')). */
  export interface Fillet {
    /** Find sharpest-corner chain along a box anchor's local Z axis. */
    findEdgeChain(meshOrMf: Manifold | MeshFile, box: AnchorPos, opts?: { samples?: number; minTurn?: number }): [number, number, number][];
    /** Sweep a tangent wedge along the corner chain and subtract from the mesh. */
    chamferEdge(
      meshOrMf: Manifold | MeshFile,
      box: AnchorPos,
      radius: number,
      opts?: {
        /** Chamfer convex (outer) edges. Default true. */
        subtract?: boolean;
        /** Fillet concave (inner) edges. Default false. */
        add?: boolean;
        /** Profile shape: 'round' (arc, default) or 'wedge' (flat bevel). */
        profile?: 'round' | 'wedge';
        /** Box-local axes to sweep. Default ['z']. Pass ['x','y','z'] to process all edges. */
        axes?: ('x' | 'y' | 'z' | '+x' | '-x' | '+y' | '-y' | '+z' | '-z')[];
        /** Target endpoint precision in mm (default 2). Binary-search refinement nails the chamfer ends to ~step. */
        step?: number;
        /** Coarse pre-sampling step in mm (default max(step*5, 1)). Lower = more slices but safer on finely curved edges. */
        coarseStep?: number;
        /** Fixed coarse sample count override. */
        samples?: number;
        /** Arc tessellation segments (default 12). */
        arcSegs?: number;
        /** Min corner turn angle in degrees (default 15). */
        minTurn?: number;
        /** Max XY drift between consecutive slices when matching chains. */
        matchTolerance?: number;
        /** Slab thickness for hull-pair sweeping (default 0.05). */
        eps?: number;
        /** At vertices where multiple convex chamfer chains meet, hull their endpoint slabs to fill the pyramid gap. Default true. */
        cornerBlend?: boolean;
      },
    ): Manifold;
  }

  /** Bezier curve helpers (use('curves')). */
  export interface Curves {
    /** Evaluate a single point on a bezier of any order using de Casteljau. */
    bezier(controls: Vec3[], t: number): [number, number, number];
    /** Evenly sample a bezier into n points. */
    sampleBezier(controls: Vec3[], samples?: number): [number, number, number][];
    /** Sample a chain of beziers that share endpoints; returns one flat polyline. */
    sampleBezierPath(segments: Vec3[][], samplesPerSeg?: number): [number, number, number][];
    /** Thick 3D curve as a chain of hulled spheres. */
    bezierTube(controls: Vec3[], radius: number, samples?: number, sphereSegs?: number): Manifold;
    /** 2D bezier sampled into a closed CrossSection. */
    bezierProfile(controls2d: Array<[number, number] | { x: number; y: number }>, samples?: number, closed?: boolean): any;
  }
}

/** Manifold module — primitive constructors, boolean ops, transforms. */
declare const m: BittyCad.ManifoldModule;
`;

let installed = false;

export function initMonacoIntellisense(monaco: typeof Monaco): void {
  if (installed) return;
  installed = true;

  const ts = monaco.languages.typescript;
  ts.javascriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ESNext,
    allowNonTsExtensions: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    module: ts.ModuleKind.ESNext,
    noEmit: true,
    allowJs: true,
    checkJs: false,
  });
  ts.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [
      1108, // 'return' outside of function (we wrap user code as a function body)
      2304, // Cannot find name (for runtime globals from the wrapper)
      2454, // used before assigned
    ],
  });

  ts.javascriptDefaults.addExtraLib(STATIC_LIB, 'inmemory://bitty-cad/static.d.ts');
}

export function refreshMonacoTypes(monaco: typeof Monaco): void {
  const anchorProps = store.anchors
    .map(a => `  /** Anchor "${a.name}" — drag in the 3D view to move. */\n  ${jsKey(a.name)}: BittyCad.AnchorPos;`)
    .join('\n');
  const meshNames = store.files.filter(f => f.kind === 'mesh').map(f => f.name);
  const meshProps = meshNames
    .map(n => `  /** Imported mesh "${n}". */\n  ${jsKey(n)}: BittyCad.MeshFile;`)
    .join('\n');
  const codeNames = store.files.filter(f => f.kind === 'code').map(f => f.name);
  const useOverloads = [
    `declare function use(name: 'layout'): BittyCad.Layout;`,
    `declare function use(name: 'shapes'): BittyCad.Shapes;`,
    `declare function use(name: 'curves'): BittyCad.Curves;`,
    `declare function use(name: 'fillet'): BittyCad.Fillet;`,
    ...codeNames.map(n => `declare function use(name: ${JSON.stringify(n)}): any;`),
    `declare function use(name: string): any;`,
  ].join('\n');

  const dynamic = `
declare const anchors: {
${anchorProps || '  [key: string]: BittyCad.AnchorPos;'}
  [key: string]: BittyCad.AnchorPos;
};
declare const meshes: {
${meshProps || '  [key: string]: BittyCad.MeshFile;'}
  [key: string]: BittyCad.MeshFile;
};
${useOverloads}
`;

  // addExtraLib with the same path replaces the previous content.
  monaco.languages.typescript.javascriptDefaults.addExtraLib(
    dynamic,
    'inmemory://bitty-cad/dynamic.d.ts',
  );
}

function jsKey(name: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : JSON.stringify(name);
}
