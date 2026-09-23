#!/usr/bin/env bash
# Build script invoked by Cloudflare Workers' build pipeline (and by
# `jake site`, which is the entry point to prefer locally).
#
# Builds the Nuxt site in nuxt-site/. Output lands in
# nuxt-site/.output/{server,public}/ and is consumed by `wrangler deploy`
# per wrangler.jsonc at the repo root, which points `main` at
# .output/server/index.mjs and the assets directory at .output/public/.
# Nuxt is the whole site: there is no separate static site any more.
#
# Static artifacts the site references (rulebook PDFs, faction-card PNGs,
# ship renders, the STL zip) are produced by the scripts under scripts/ —
# run them via `jake`, see Jakefile.js — and exposed to Nuxt via symlinks at
# nuxt-site/public/{rulebook,assets}. The /game/ static HTML lives directly at
# nuxt-site/public/game/ (no symlink). Whichever environment runs this script
# must already have those artifacts present (either committed to the repo or
# built earlier in CI via `jake`).
set -euo pipefail

ROOT="$(dirname "$0")"

# Refuse to build if a paid set has been placed under assets/. Everything in
# that tree is symlinked into nuxt-site/public/ and published as a static
# asset, so a paid model sitting there is downloadable by anyone as soon as
# this deploys — which is exactly what happened once. .gitignore does not
# help: it governs what is committed, not what is served. Paid sets belong in
# paid-sets/, outside the published tree.
if compgen -G "$ROOT/assets/stls/*/set.json" >/dev/null; then
    for set_json in "$ROOT"/assets/stls/*/set.json; do
        # grep, not jq: this runs in Cloudflare's build image, which is not
        # guaranteed to have jq, and a guard that fails open is worthless.
        if grep -qE '"paid"[[:space:]]*:[[:space:]]*true' "$set_json"; then
            echo "error: $(dirname "${set_json#"$ROOT"/}") is a PAID set inside the published assets tree." >&2
            echo "       Move it to paid-sets/ before deploying — assets/ is served publicly." >&2
            exit 1
        fi
    done
fi

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

# The /game/ files have fixed names, so a browser could mix a new net.js with
# an old constants.js after a deploy. Stamp every script and stylesheet URL in
# the built index.html with a hash of the game files, so each deploy loads one
# matching set (index.html itself is served no-cache, see _headers).
GAME_VER="$(cat public/game/*.js public/game/*.css | sha1sum | cut -c1-10)"
sed -i -E "s#(src|href)=\"([A-Za-z0-9_-]+\.(js|css))\"#\1=\"\2?v=$GAME_VER\"#g" .output/public/game/index.html
echo "Stamped /game/ assets with v=$GAME_VER"

echo "Built nuxt-site/.output/ ($(du -sh .output | cut -f1))"
