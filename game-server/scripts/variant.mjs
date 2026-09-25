// Build a patched copy of the bundled engine for an A/B test, without
// touching the real rules. Pair it with balance.mjs --engine:
//
//   node scripts/variant.mjs /tmp/coins2.js --set VP_COIN=2
//   node scripts/balance.mjs --engine /tmp/coins2.js --games 2
//
// Edits:
//   --set NAME=value          replace a top-level `const NAME = ...;` value
//                             (the first const on its line: `const A = 1, B = 2`
//                             sets A; use --replace for the others)
//   --replace FIND REPLACE    replace one exact piece of source text
//   --edits file.json         [{ "find": "...", "replace": "..." }, ...]
//
// Every edit must match exactly once, or the script stops: an edit that
// quietly matched nothing would test the unchanged game. Build the engine
// first (npm run build:engine) so the variant starts from current rules.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const out = args[0];
if (!out || out.startsWith('--')) {
  console.error('usage: node scripts/variant.mjs <out.js> [--set NAME=value] [--replace FIND REPLACE] [--edits file.json]');
  process.exit(1);
}
const src = fileURLToPath(new URL('../src/engine.gen.js', import.meta.url));
let code = readFileSync(src, 'utf8');
const edits = [];
for (let i = 1; i < args.length; i++) {
  if (args[i] === '--set') {
    const [name, ...rest] = args[++i].split('=');
    const re = new RegExp(`^(const ${name} = )[^,;\\n]+`, 'm');
    edits.push({ label: `--set ${name}`, apply: s => { if (!re.test(s)) throw new Error(`no top-level const ${name}`); return s.replace(re, `$1${rest.join('=')}`); } });
  } else if (args[i] === '--replace') {
    edits.push({ find: args[++i], replace: args[++i] });
  } else if (args[i] === '--edits') {
    for (const e of JSON.parse(readFileSync(args[++i], 'utf8'))) edits.push(e);
  } else throw new Error(`unknown option ${args[i]}`);
}
for (const e of edits) {
  if (e.apply) { code = e.apply(code); console.log(`applied ${e.label}`); continue; }
  const n = code.split(e.find).length - 1;
  if (n !== 1) { console.error(`edit matched ${n} times, needs exactly 1:\n  ${e.find}`); process.exit(1); }
  code = code.replace(e.find, e.replace);
  console.log(`applied: ${e.find.slice(0, 70)}${e.find.length > 70 ? '…' : ''}`);
}
writeFileSync(out, `// Variant of src/engine.gen.js built by scripts/variant.mjs. Do not commit.\n${code}`);
console.log(`wrote ${out}. Run: node scripts/balance.mjs --engine ${out}`);
