// Bundle the web game's 3D table (app/lib/game3d.ts, with three.js, the sea
// and the ship assembly code it shares with the shop) into one classic
// script for public/game/, where the game's other files are plain scripts
// with no build step. It defines the global CNC3D.
//
//   node scripts/build-game3d.mjs           # minified, as deployed
//   node scripts/build-game3d.mjs --watch   # rebuild on change, for dev
//
// The output is generated, so it is gitignored; ../build.sh runs this
// before `nuxt build`.
import { build, context } from 'esbuild'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const watch = process.argv.includes('--watch')
const options = {
  absWorkingDir: root,
  entryPoints: ['app/lib/game3d.ts'],
  outfile: 'public/game/game3d.js',
  bundle: true,
  format: 'iife',
  globalName: 'CNC3D',
  target: 'es2020',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
}

if (watch) {
  const ctx = await context(options)
  await ctx.watch()
} else {
  await build(options)
}
