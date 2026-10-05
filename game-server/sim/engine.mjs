// Build a hookable copy of the rules engine for the simulator.
//
// It starts from src/engine.gen.js (the same bundle the balance tests and
// the online server run) and changes three things, none of which touch the
// shipped game:
//   1. Top-level `const` becomes `let`, so every rule function, constant and
//      table in the engine can be replaced at run time.
//   2. A few hook points go into the computer captain where a new rule needs
//      it to think differently and there is no function to wrap (HOOKS).
//   3. An `X` export with a getter and setter for every top-level name.
//      `X.CLICK_LEN = 6` or `X.scoreBreakdown = wrapped` changes what the
//      engine itself calls, because its calls go through the same bindings.
//
// Each variant gets its own module instance (imported with ?v=<key>), so
// one variant's changes never leak into another's games.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const SRC = new URL('../src/engine.gen.js', import.meta.url);
const OUT = new URL('./.build/', import.meta.url);

// Hook points inside functions. Each must match exactly once; the defaults
// (DEFAULTS) do nothing, so the unchanged game plays exactly as shipped.
const HOOKS = [
  // Extra worth a variant gives an island when the fleet plans its jobs (treasure islands).
  { find: 'let value = owner ? 7 - 3 * defenders : 10;', replace: 'let value = (owner ? 7 - 3 * defenders : 10) + __simIslandValue(t, p);' },
];
const DEFAULTS = `
let __simIslandValue = () => 0;
`;

/** Apply exact-once text edits; an edit that matched nothing would quietly test the unchanged game. */
function applyEdits(code, edits, where) {
  for (const e of edits) {
    const n = code.split(e.find).length - 1;
    if (n !== 1) throw new Error(`${where}: edit matched ${n} times, needs exactly 1:\n  ${e.find}`);
    code = code.replace(e.find, () => e.replace);
  }
  return code;
}

/** Top-level names in the bundle: declarations at column 0, plus extra ALL_CAPS declarators on the same line. */
function topLevelNames(code) {
  const names = new Set();
  for (const line of code.split('\n')) {
    const m = line.match(/^(?:let|const|var|class|async function\*?|function\*?)\s+([A-Za-z_$][\w$]*)/);
    if (!m) continue;
    names.add(m[1]);
    if (/^(let|const|var) /.test(line)) for (const x of line.matchAll(/,\s*([A-Z_][A-Z0-9_]*)\s*=(?!=)/g)) names.add(x[1]);
  }
  return [...names];
}

/**
 * Write a hookable engine with these extra source patches and return its
 * path. Files are named by content, so the same patches reuse one file.
 */
export function buildEngine(patches = [], label = 'variant') {
  let code = readFileSync(SRC, 'utf8');
  code = applyEdits(code, HOOKS, 'sim hook');
  code = applyEdits(code, patches, label);
  code = code.replace(/^const /gm, 'let ');
  code += DEFAULTS;
  const names = topLevelNames(code);
  code += `\nexport const X = {\n${names.map(n => `  get ${n}() { return ${n}; }, set ${n}(v) { ${n} = v; },`).join('\n')}\n};\n`;
  const hash = createHash('sha1').update(code).digest('hex').slice(0, 12);
  mkdirSync(OUT, { recursive: true });
  const file = new URL(`engine-${hash}.mjs`, OUT);
  writeFileSync(file, `// Built by game-server/sim/engine.mjs for the simulator. Do not edit or commit.\n${code}`);
  return fileURLToPath(file);
}
