#!/usr/bin/env bash
# Publish paid (non-base-game) STL sets to R2.
#
#   scripts/publish-paid-sets.sh                 # publish every paid set that has files
#   scripts/publish-paid-sets.sh treasure-fleet-set stone-fleet-set
#   DRY_RUN=1 scripts/publish-paid-sets.sh       # show what would upload
#
# R2 is the only place these files are served from. They are deliberately
# absent from git (see the paid-set block in .gitignore): a committed binary is
# recoverable from every clone forever, so the local folders under
# assets/stls/<set>/ are a staging area, not storage.
#
# What gets uploaded, per set:
#   <set-id>/v<version>/<set-id>-v<version>.zip   the zip buyers download
#   <set-id>/v<version>/MANIFEST.txt              sha256 of every file in it
#   <set-id>/v<version>/files/<name>.stl          each paid STL on its own
#   <set-id>/v<version>/plates/<name>.3mf         each paid print-plate 3MF
# (the last two for the print list's "Open in Cubby Slicer" links, served by
# /api/download/<set>/<file> behind the same check as the zip)
# and per bundle (bundles in the site manifest, e.g. all-fleets):
#   <bundle-id>/<set-id>-v<version>_.../<zipBaseName>.zip
#   <bundle-id>/<set-id>-v<version>_.../MANIFEST.txt
#
# The bundle is every fleet in one zip, a folder each, with the print guide
# at the top. It is rebuilt and uploaded on every run, since its key changes
# whenever any set in it is bumped. scripts/build-paid-zips.sh builds all of
# it (PAID_SET_ROOT picks another paid-sets/ folder, e.g. from a worktree).
#
# A zip is what /api/download/<set-or-bundle> streams. MANIFEST.txt is not served; it
# is there so you can answer "what exactly did we ship as v2" later.
#
# The version of record is each set folder's set.json; status, price and the
# rest come from the site manifest nuxt-site/server/data/sets.json. The two are
# checked against each other before anything is packaged, so an R2 key can
# never name a version the site would not ask for.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/common.sh"

MANIFEST="$REPO_ROOT/nuxt-site/server/data/sets.json"
BUCKET="${R2_BUCKET:-cannons-and-coastlines-paid-sets}"
DRY_RUN="${DRY_RUN:-}"

need() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "error: $1 is required but not installed" >&2
        exit 1
    }
}
need jq
need sha256sum
need npx

[[ -f "$MANIFEST" ]] || { echo "error: manifest not found at $MANIFEST" >&2; exit 1; }

# Build every zip first (scripts/build-paid-zips.sh, into build/paid-zips/,
# laid out as the R2 keys), so nothing uploads unless the whole build worked.
# The version checks against the site manifest happen there.
OUT="$REPO_ROOT/build/paid-zips"
PAID_ZIP_OUT="$OUT" "$REPO_ROOT/scripts/build-paid-zips.sh" "$@"

published=0
shopt -s nullglob
zips=("$OUT"/*/*/*.zip)
shopt -u nullglob
for zip_path in "${zips[@]}"; do
    prefix="${zip_path#"$OUT"/}"
    prefix="${prefix%/*}"
    zip_name="${zip_path##*/}"

    echo
    echo "▸ $prefix/$zip_name"
    if [[ -n "$DRY_RUN" ]]; then
        echo "  DRY RUN — would upload:"
        echo "    r2://$BUCKET/$prefix/$zip_name"
        echo "    r2://$BUCKET/$prefix/MANIFEST.txt"
        shopt -s nullglob
        for f in "$OUT/$prefix"/files/*.stl "$OUT/$prefix"/plates/*.3mf; do echo "    r2://$BUCKET/${f#"$OUT"/}"; done
        shopt -u nullglob
    else
        npx wrangler r2 object put "$BUCKET/$prefix/$zip_name" \
            --file "$zip_path" --content-type application/zip --remote
        npx wrangler r2 object put "$BUCKET/$prefix/MANIFEST.txt" \
            --file "$OUT/$prefix/MANIFEST.txt" --content-type text/plain --remote
        shopt -s nullglob
        for f in "$OUT/$prefix"/files/*.stl "$OUT/$prefix"/plates/*.3mf; do
            rel="${f#"$OUT"/}"
            type=model/stl; [[ "$f" == *.3mf ]] && type=model/3mf
            npx wrangler r2 object put "$BUCKET/$rel" --file "$f" --content-type "$type" --remote
        done
        shopt -u nullglob
        echo "  uploaded to r2://$BUCKET/$prefix/"
    fi
    (( published++ )) || true
done

echo
echo "Done: $published zip(s) published."
if (( published )) && [[ -z "$DRY_RUN" ]]; then
    cat <<'EOF'

To put a published set on sale, in nuxt-site/server/data/sets.json:
  1. set "priceUsd" to the amount (checkout builds the Stripe line item)
  2. flip "status" to "available"
Until both are done the set stays "Coming Soon" and both /api/checkout and
/api/download refuse it. That is the drip-feed switch — one set at a time.
EOF
fi
