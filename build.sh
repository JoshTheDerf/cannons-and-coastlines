#!/usr/bin/env bash
# Build script invoked by Cloudflare Workers' build pipeline.
#
# Builds the Nuxt site in nuxt-site/. Output lands in
# nuxt-site/.output/{server,public}/ and is consumed by `wrangler deploy`
# per wrangler.jsonc at the repo root.
#
# Static artifacts the site references (rulebook PDFs, faction-card PNGs,
# the STL zip) are produced by the typst/blender pipeline at the repo
# root and exposed to Nuxt via symlinks at nuxt-site/public/{rulebook,assets}.
# The /game/ static HTML lives directly at nuxt-site/public/game/ (no
# symlink). Whichever environment runs this script must already have the
# generated artifacts present (committed to the repo or built earlier in CI).
set -euo pipefail

ROOT="$(dirname "$0")"
cd "$ROOT/nuxt-site"

# Stage the Cloudflare _headers/_redirects into the Nuxt public/ tree so they
# end up in .output/public/. Copies (not symlinks) are required: Nitro
# appends its own routing rules to .output/public/_headers during build, and
# would write through a symlink back to the committed source. These copies
# are gitignored so build artifacts don't pollute version control.
cp -f ../_headers   public/_headers
cp -f ../_redirects public/_redirects

# `npm ci` if a lockfile is present and matches; otherwise fall back to
# `npm install` (e.g. local dev where lockfile churn is fine).
if [ -f package-lock.json ]; then
    npm ci
else
    npm install
fi

npm run build

echo "Built nuxt-site/.output/ ($(du -sh .output | cut -f1))"
