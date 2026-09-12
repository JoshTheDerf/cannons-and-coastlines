#!/usr/bin/env bash
# Publish paid (non-base-game) STL sets to R2.
#
#   scripts/publish-paid-sets.sh                 # publish every paid set that has files
#   scripts/publish-paid-sets.sh treasure-fleet-set sun-fleet-set
#   DRY_RUN=1 scripts/publish-paid-sets.sh       # show what would upload
#
# R2 is the only place these files are served from. They are deliberately
# absent from git (see the paid-set block in .gitignore): a committed binary is
# recoverable from every clone forever, so the local folders under
# assets/stls/<set>/ are a staging area, not storage.
#
# What gets uploaded, per set:
#   <set-id>/v<version>/<set-id>-v<version>.zip   the bundle buyers download
#   <set-id>/v<version>/MANIFEST.txt              sha256 of every file in it
#
# The zip is what /api/download/<set> streams. MANIFEST.txt is not served; it
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
need zip
need sha256sum
need npx

[[ -f "$MANIFEST" ]] || { echo "error: manifest not found at $MANIFEST" >&2; exit 1; }

# Which sets to publish: the ids given on the command line, or every paid set.
if (( $# )); then
    requested=("$@")
else
    mapfile -t requested < <(jq -r '.sets[] | select(.paid) | .id' "$MANIFEST")
fi

published=0
skipped=0

for set_id in "${requested[@]}"; do
    entry="$(jq -c --arg id "$set_id" '.sets[] | select(.id == $id)' "$MANIFEST")"
    if [[ -z "$entry" ]]; then
        echo "error: '$set_id' is not in $MANIFEST" >&2
        exit 1
    fi

    paid="$(jq -r '.paid'      <<<"$entry")"
    src_rel="$(jq -r '.sourceDir' <<<"$entry")"
    status="$(jq -r '.status'  <<<"$entry")"
    src="$REPO_ROOT/$src_rel"

    # The version of record is the set folder's set.json, not this manifest —
    # it sits with the files it describes. require_version_agreement refuses to
    # publish while the two disagree, so an R2 key can never name a version the
    # site will not ask for.
    if [[ "$paid" == "true" && -d "$src" ]]; then
        require_version_agreement "$set_id" "$src"
        version="$(set_field "$src" '.version')"
    else
        version="$(jq -r '.version' <<<"$entry")"
    fi

    if [[ "$paid" != "true" ]]; then
        echo "skip  $set_id — free set, served as a static asset, nothing to upload"
        (( skipped++ )) || true
        continue
    fi

    # Model files only: set.json is repo bookkeeping and has no business in a
    # buyer's download. An empty staging folder is the normal state for a set
    # you have not finished yet, so it is a skip rather than an error.
    shopt -s nullglob
    files=("$src"/*.stl "$src"/*.svg "$src"/*.3mf)
    shopt -u nullglob
    if (( ${#files[@]} == 0 )); then
        echo "skip  $set_id — $src_rel is empty (drop the STLs in, then re-run)"
        (( skipped++ )) || true
        continue
    fi

    echo
    echo "▸ $set_id  (v$version, status: $status)"
    echo "  source: $src_rel  (${#files[@]} files)"

    staging="$(mktemp -d)"
    trap 'rm -rf "$staging"' EXIT

    zip_name="${set_id}-v${version}.zip"
    zip_path="$staging/$zip_name"

    # -X drops extra file attributes (uid/gid, timestamps beyond the DOS
    # field) so republishing unchanged files produces a byte-identical zip
    # and you can tell a real content change from a repack.
    ( cd "$src" && zip -qXj "$zip_path" "${files[@]##*/}" )

    # Checksums of the *inputs*, not the zip: this is the record of what the
    # set contained, independent of how it was packed.
    manifest_path="$staging/MANIFEST.txt"
    {
        echo "# $set_id v$version"
        echo "# packed $(date -u +%Y-%m-%dT%H:%M:%SZ) from $src_rel"
        echo
        ( cd "$src" && printf '%s\0' "${files[@]##*/}" | sort -z | xargs -0 sha256sum )
    } > "$manifest_path"

    size="$(du -h "$zip_path" | cut -f1)"
    count="$(grep -c '^[0-9a-f]' "$manifest_path" || true)"
    echo "  bundle: $zip_name ($size, $count files)"

    prefix="${set_id}/v${version}"
    if [[ -n "$DRY_RUN" ]]; then
        echo "  DRY RUN — would upload:"
        echo "    r2://$BUCKET/$prefix/$zip_name"
        echo "    r2://$BUCKET/$prefix/MANIFEST.txt"
    else
        npx wrangler r2 object put "$BUCKET/$prefix/$zip_name" \
            --file "$zip_path" --content-type application/zip --remote
        npx wrangler r2 object put "$BUCKET/$prefix/MANIFEST.txt" \
            --file "$manifest_path" --content-type text/plain --remote
        echo "  uploaded to r2://$BUCKET/$prefix/"
    fi

    rm -rf "$staging"
    trap - EXIT
    (( published++ )) || true
done

echo
echo "Done: $published published, $skipped skipped."
if (( published )) && [[ -z "$DRY_RUN" ]]; then
    cat <<'EOF'

To put a published set on sale, in nuxt-site/server/data/sets.json:
  1. set "stripePriceId" to the Stripe Price id and "priceUsd" to the amount
  2. flip "status" to "available"
Until both are done the set stays "Coming Soon" and both /api/checkout and
/api/download refuse it. That is the drip-feed switch — one set at a time.
EOF
fi
