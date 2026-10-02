/* eslint-env node */
/* global desc, task */
// Build orchestration. Every build step in the repo is a shell script under
// scripts/; this file just names them, so `npx jake -T` is a complete index of
// what can be built.
//
//   npx jake                 # the full build
//   npx jake rulebook        # or any single step below
//   npx jake -T              # list everything
//
// Typst is found via $TYPST (default: `typst`):
//   TYPST=~/.local/bin/typst npx jake rulebook

const { execSync } = require('child_process');
const path = require('path');

const ROOT = __dirname;

function sh(script, args = []) {
    const cmd = [path.join(ROOT, script), ...args].join(' ');
    console.log(`\n› ${cmd}`);
    execSync(cmd, {
        stdio: 'inherit',
        cwd: ROOT,
        env: { ...process.env, TYPST: process.env.TYPST || 'typst' },
    });
}

// name -> [description, script, dependencies]. The only place a build step is
// declared; add a row here and it shows up in `npx jake -T`.
const TASKS = {
    'stl':         ['Build the public STL zip for each free set (with PRINTING.pdf and .md)', 'scripts/build-stl-zip.sh'],
    'rulebook':    ['Build rulebook PDF + per-page PNG + SVG', 'scripts/rulebook/build-rulebook.sh'],
    'booklet':     ['Build the imposed rulebook booklet PDF', 'scripts/rulebook/build-booklet.sh', ['rulebook']],
    'cards':       ['Build the seven faction cards (PDF + 300dpi PNG)', 'scripts/rulebook/build-cards.sh'],
    'card-sheets': ['Build the two-up faction-card print sheet', 'scripts/rulebook/build-card-sheets.sh', ['cards']],
    'scoring-card': ['Build the standalone scoring reference card (PDF + 300dpi PNG)', 'scripts/rulebook/build-scoring-card.sh'],
    'versatile-admiral':         ['Build "The Versatile Admiral" addon rulebook', 'scripts/rulebook/build-versatile-admiral.sh'],
    'versatile-admiral-booklet': ['Build the imposed Versatile Admiral booklet', 'scripts/rulebook/build-versatile-admiral-booklet.sh', ['versatile-admiral']],
    'letter':      ['Build the welcome letter PDF that ships in the box', 'scripts/rulebook/build-letter.sh'],
    'trade-winds': ['Build the one-page Trade Winds variant handout (PDF + PNG)', 'scripts/rulebook/build-trade-winds.sh'],
    'print-lists': ['Build the print list PDFs the site links (rulebook/pdf/print-list-<set>.pdf); the zips build their own', 'scripts/rulebook/build-print-lists.sh'],
    'site':        ['Build the Nuxt site (nuxt-site/.output/) for the Workers deploy', 'build.sh'],

    // Occasional steps, kept out of the full build because they need tools a
    // CI box will not have (Blender, ImageMagick, OrcaSlicer, wrangler auth).
    'renders':       ['Render the parts gallery: base-set pieces + every hull — needs Blender', 'scripts/blender/render_parts.sh'],
    'ship-previews': ['Render the ship 3/4 previews in Blender — needs Blender', 'scripts/blender/render_ship_previews.sh'],
    'set-previews':  ["Render one set's ship art and install it, e.g. set-previews[industry-set] — needs Blender", 'scripts/blender/render_set_previews.sh'],
    'preview-meshes': ['Build the shop 3D preview meshes from ship-assemblies.json — needs Blender', 'scripts/blender/build_preview_meshes.sh'],
    'social-cards':  ['Build the link-preview picture for each shop page (assets/images/social/) — needs ImageMagick', 'scripts/rulebook/build-social-cards.sh'],
    'banner-fade':   ['Regenerate the faction-card banner overlays — needs ImageMagick', 'scripts/rulebook/build-banner-fade.sh'],
    'print-plates':  ['Build the print lists\' 3MFs, one per fleet and color (PAID_SET_ROOT=... for the paid ones) — needs OrcaSlicer', 'scripts/print/build_print_plates.py'],
    'starter-pack-3mf': ['Slice starter-pack 3MFs, e.g. starter-pack-3mf[--queens,2] — needs OrcaSlicer', 'scripts/print/build-starter-pack-3mf.sh'],
    'bump-set':      ['Release a new version of a set, e.g. bump-set[base-set,0.4]: set.json, site manifest, zip', 'scripts/bump-set.sh'],
    'sets-sync':     ['Copy each set.json version into the site manifest (CHECK=1 to only report)', 'scripts/sync-sets-manifest.sh'],
    'paid-zips':     ['Build the paid set zips and the all-fleets bundle into build/paid-zips/ (PAID_SET_ROOT=... to read another paid-sets/)', 'scripts/build-paid-zips.sh'],
    'publish-sets':  ['Build the paid zips and bundle and upload them to R2, e.g. publish-sets[treasure-fleet-set] — needs wrangler auth', 'scripts/publish-paid-sets.sh'],
};

for (const [name, [description, script, deps = []]] of Object.entries(TASKS)) {
    desc(description);
    task(name, deps, function (...args) { sh(script, args); });
}

desc('Full build: STL zip, rulebook + booklet, Trade Winds, cards + sheets, scoring card, addon rulebook, print lists, then the site');
task('default', [
    'stl', 'rulebook', 'booklet', 'trade-winds', 'cards', 'card-sheets', 'scoring-card',
    'versatile-admiral', 'versatile-admiral-booklet', 'print-lists', 'site',
], () => {
    console.log('\nAll build steps complete.');
});
