/* eslint-env node */
/* global desc, task, namespace */
// Root build orchestration. Runs each step as a shell script so this file
// stays the single entry point for "build everything in order".
//
// Usage:
//   jake          # default: full build (stl-zip -> rulebook -> booklet -> cards -> site)
//   jake stl      # just the versioned STL zip
//   jake rulebook # rulebook PDF/PNG/SVG
//   jake booklet  # imposed booklet PDF (depends on rulebook SVGs)
//   jake cards    # faction cards
//   jake site     # dist/ for Cloudflare Pages

const { execSync } = require('child_process');
const path = require('path');

const ROOT = __dirname;
const TYPST = process.env.TYPST || 'typst';

function sh(cmd) {
    console.log(`\n› ${cmd}`);
    execSync(cmd, { stdio: 'inherit', cwd: ROOT, env: { ...process.env, TYPST } });
}

desc('Build versioned STL zip(s) from assets/stls/cannons-and-coastlines-base-set-*');
task('stl', [], () => {
    sh(path.join(ROOT, 'scripts/build-stl-zip.sh'));
});

desc('Build rulebook PDF + per-page PNG + SVG');
task('rulebook', [], () => {
    sh(path.join(ROOT, 'rulebook/typst/build-rulebook.sh'));
});

desc('Build imposed booklet PDF (depends on rulebook SVGs)');
task('booklet', ['rulebook'], () => {
    sh(path.join(ROOT, 'rulebook/typst/build-booklet.sh'));
});

desc('Build the seven faction cards (PDF + 300dpi PNG)');
task('cards', [], () => {
    sh(path.join(ROOT, 'rulebook/typst/build-cards.sh'));
});

desc('Build the combined faction-card print sheet (two cards per US-letter page)');
task('card-sheets', ['cards'], () => {
    sh(path.join(ROOT, 'rulebook/typst/build-card-sheets.sh'));
});

desc('Build dist/ for Cloudflare Pages deploy');
task('site', [], () => {
    sh(path.join(ROOT, 'build.sh'));
});

desc('Full build: stl zip, rulebook, booklet, cards, card-sheets, then site bundle');
task('default', ['stl', 'rulebook', 'booklet', 'cards', 'card-sheets', 'site'], () => {
    console.log('\nAll build steps complete.');
});
