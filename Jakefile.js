/* eslint-env node */
/* global desc, task, namespace */
// Root build orchestration. Every build step in the repo is a shell script
// under scripts/; this file is the single place that names them, so
// `npx jake -T` is a complete index of what can be built.
//
// Usage:
//   jake                    # default: everything the site ships
//   jake stl                # public versioned STL zip(s) for the free sets
//   jake rulebook           # rulebook PDF/PNG/SVG
//   jake booklet            # imposed rulebook booklet (depends on rulebook)
//   jake cards              # the seven faction cards
//   jake card-sheets        # two-up faction-card print sheet (depends on cards)
//   jake versatile-admiral  # "The Versatile Admiral" addon rulebook
//   jake versatile-admiral-booklet
//   jake letter            # welcome letter PDF for the box
//   jake site               # nuxt-site/.output/ for the Cloudflare Workers deploy
//
// Occasional steps, not part of the default build because they need tools
// that aren't on a CI box (Blender, ImageMagick, OrcaSlicer):
//   jake renders            # Blender part renders -> assets/images/renders
//   jake ship-previews      # Blender ship previews -> assets/ships/renders
//   jake set-previews       # render one set's ships + the site-sized derivatives
//   jake banner-fade        # regenerate the faction-card banner overlays
//   jake starter-pack-3mf   # OrcaSlicer 3MFs for a starter-pack order
//   jake sets-sync          # sync set.json versions into the site manifest
//   jake publish-sets       # upload paid STL sets to R2 (needs wrangler auth)
//
// Typst is found via $TYPST (default: `typst`), e.g.
//   TYPST=~/.local/bin/typst npx jake rulebook

const { execSync } = require('child_process');
const path = require('path');

const ROOT = __dirname;
const TYPST = process.env.TYPST || 'typst';

function sh(script, args = []) {
    const cmd = [path.join(ROOT, script), ...args].join(' ');
    console.log(`\n› ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, TYPST } });
}

desc('Build the public versioned STL zip for each free set (version from its set.json)');
task('stl', [], () => {
    sh('scripts/build-stl-zip.sh');
});

desc('Build rulebook PDF + per-page PNG + SVG');
task('rulebook', [], () => {
    sh('scripts/rulebook/build-rulebook.sh');
});

desc('Build imposed booklet PDF (depends on the rulebook PDF)');
task('booklet', ['rulebook'], () => {
    sh('scripts/rulebook/build-booklet.sh');
});

desc('Build the seven faction cards (PDF + 300dpi PNG)');
task('cards', [], () => {
    sh('scripts/rulebook/build-cards.sh');
});

desc('Build the combined faction-card print sheet (two cards per US-letter page)');
task('card-sheets', ['cards'], () => {
    sh('scripts/rulebook/build-card-sheets.sh');
});

desc('Build "The Versatile Admiral" addon rulebook (PDF + per-page PNG)');
task('versatile-admiral', [], () => {
    sh('scripts/rulebook/build-versatile-admiral.sh');
});

desc('Build the imposed Versatile Admiral booklet (depends on versatile-admiral)');
task('versatile-admiral-booklet', ['versatile-admiral'], () => {
    sh('scripts/rulebook/build-versatile-admiral-booklet.sh');
});

desc('Build the welcome letter PDF that ships in the box');
task('letter', [], () => {
    sh('scripts/rulebook/build-letter.sh');
});

desc('Build the Nuxt site (nuxt-site/.output/) for the Cloudflare Workers deploy');
task('site', [], () => {
    sh('build.sh');
});

desc('Render every part STL in Blender (assets/images/renders/) — needs Blender');
task('renders', [], () => {
    sh('scripts/blender/render_stls.sh');
});

desc('Render the ship 3/4 previews in Blender (assets/ships/renders/) — needs Blender');
task('ship-previews', [], () => {
    sh('scripts/blender/render_ship_previews.sh');
});

desc('Regenerate the faction-card banner parchment overlays — needs ImageMagick');
task('banner-fade', [], () => {
    sh('scripts/rulebook/build-banner-fade.sh');
});

desc('Slice starter-pack 3MFs for an order, e.g. jake starter-pack-3mf[--queens,2] — needs OrcaSlicer');
task('starter-pack-3mf', [], function (...args) {
    sh('scripts/print/build-starter-pack-3mf.sh', args);
});

desc('Render a set\'s ship art and install it where the site links it, e.g. jake set-previews[industry-set] — needs Blender');
task('set-previews', [], function (...args) {
    sh('scripts/blender/render_set_previews.sh', args);
});

desc('Copy each set.json version into the site manifest (CHECK=1 to only report drift)');
task('sets-sync', [], () => {
    sh('scripts/sync-sets-manifest.sh');
});

desc('Upload paid STL sets to R2, e.g. jake publish-sets[treasure-fleet-set] — needs wrangler auth');
task('publish-sets', [], function (...args) {
    // Deliberately outside `default`: this pushes sellable files to R2 and
    // costs money to get wrong. It is never part of an unattended build.
    sh('scripts/publish-paid-sets.sh', args);
});

desc('Full build: STL zip, rulebook + booklet, cards + sheets, addon rulebook, then the site');
task('default', [
    'stl',
    'rulebook',
    'booklet',
    'cards',
    'card-sheets',
    'versatile-admiral',
    'versatile-admiral-booklet',
    'site',
], () => {
    console.log('\nAll build steps complete.');
});
