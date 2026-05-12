import { markRaw } from 'vue';
import { getManifold } from './manifold.js';
import { getTrackedCuts } from './manifoldPatch';
import { BUILTINS } from './builtins';
import type { Manifold } from 'manifold-3d';
import type { ExposedMesh, BuildResult, LogLevel } from '../store.js';

export type Logger = (level: LogLevel, message: string, file?: string) => void;

export interface RunResult {
  results: BuildResult[];
  error: string | null;
}

export async function runFile(
  entryName: string,
  codeFiles: Record<string, string>,
  meshes: Record<string, ExposedMesh>,
  anchors: Record<string, { x: number; y: number; z: number; kind?: string; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number }>,
  logger?: Logger,
): Promise<RunResult> {
  const wasm = await getManifold();
  const cache = new Map<string, unknown>();
  const stack: string[] = [];

  function makeConsole(file: string) {
    const fmt = (args: unknown[]) => args.map(stringify).join(' ');
    return {
      log:   (...args: unknown[]) => logger?.('log',   fmt(args), file),
      info:  (...args: unknown[]) => logger?.('info',  fmt(args), file),
      warn:  (...args: unknown[]) => logger?.('warn',  fmt(args), file),
      error: (...args: unknown[]) => logger?.('error', fmt(args), file),
    };
  }

  function run(name: string): unknown {
    if (cache.has(name)) return cache.get(name);
    if (stack.includes(name)) {
      throw new Error(`Circular import: ${[...stack, name].join(' -> ')}`);
    }
    const source = codeFiles[name] ?? BUILTINS[name];
    if (source == null) throw new Error(`No code file: '${name}'`);
    stack.push(name);
    let fn: Function;
    try {
      fn = new Function('m', 'anchors', 'meshes', 'use', 'console', `"use strict";\n${source}`);
    } catch (e: any) {
      throw new Error(`Parse [${name}]: ${e.message}`);
    }
    let result: unknown;
    try {
      result = fn(wasm, anchors, meshes, run, makeConsole(name));
    } catch (e: any) {
      throw new Error(`Runtime [${name}]: ${e.message}`);
    } finally {
      stack.pop();
    }
    cache.set(name, result);
    return result;
  }

  try {
    const out = run(entryName);
    if (out == null) return { results: [], error: null };
    return { results: normalize(out), error: null };
  } catch (e: any) {
    logger?.('error', e.message);
    return { results: [], error: e.message };
  }
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.stack || v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}

function normalize(out: unknown): BuildResult[] {
  if (isManifold(out)) return [{ name: 'result', manifold: markRaw(out) }];
  if (Array.isArray(out)) {
    const results: BuildResult[] = [];
    out.forEach((item, i) => {
      const r = toResult(`part_${i + 1}`, item);
      if (r) results.push(r);
    });
    return results;
  }
  if (out && typeof out === 'object') {
    const results: BuildResult[] = [];
    for (const [name, v] of Object.entries(out as Record<string, unknown>)) {
      const r = toResult(name, v);
      if (r) results.push(r);
    }
    return results;
  }
  return [];
}

function toResult(name: string, v: unknown): BuildResult | null {
  if (isManifold(v)) {
    const tracked = getTrackedCuts(v).map(c => markRaw(c));
    return {
      name,
      manifold: markRaw(v),
      cuts: tracked.length ? tracked : undefined,
    };
  }
  if (v && typeof v === 'object' && isManifold((v as any).manifold)) {
    const w = v as { manifold: Manifold; color?: string; cuts?: unknown };
    const explicit = Array.isArray(w.cuts)
      ? w.cuts.filter(isManifold).map(c => markRaw(c as Manifold))
      : null;
    const tracked = getTrackedCuts(w.manifold).map(c => markRaw(c));
    const cuts = explicit ?? (tracked.length ? tracked : undefined);
    return {
      name,
      manifold: markRaw(w.manifold),
      color: typeof w.color === 'string' ? w.color : undefined,
      cuts,
    };
  }
  return null;
}

function isManifold(v: unknown): v is Manifold {
  return !!v && typeof v === 'object' && typeof (v as any).getMesh === 'function';
}
