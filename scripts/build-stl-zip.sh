#!/usr/bin/env bash
# Build the public, versioned STL zip for every FREE set under assets/stls/.
#
#   npx jake stl                 # every free set
#   scripts/build-stl-zip.sh base-set
#
# The version used to come from the folder name
# (cannons-and-coastlines-base-set-0.3/ -> ...-0.3.zip). Folders are now plain
# (base-set/), so each one carries a set.json holding its version of record and
# the zip's filename stem:
#
#   { "version": "0.3", "publicZipBaseName": "cannons-and-coastlines-base-set" }
#     -> assets/stls/cannons-and-coastlines-base-set-0.3.zip
#
# Bumping a version means editing set.json and re-running this; add a
# _redirects line pointing the old zip at the new one so existing links keep
# working (see _redirects, which already forwards 0.1 and 0.2).
#
# PAID SETS ARE REFUSED, and only assets/stls/ is scanned. Everything under
# assets/ is served publicly by the Worker, so a paid set's zip written here
# would publish the very files this project keeps out of git. Paid sets stage
# in paid-sets/, outside the published tree, and go to R2 via
# scripts/publish-paid-sets.sh. The paid check below is belt-and-braces in
# case one is ever placed in the wrong root.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required but not installed" >&2; exit 1; }

# Which sets: the ids named on the command line, or every folder with a set.json.
if (( $# )); then
    requested=("$@")
else
    shopt -s nullglob
    requested=()
    for dir in "$STL_ROOT"/*/; do
        [[ -f "${dir}set.json" ]] && requested+=("$(basename "${dir%/}")")
    done
    shopt -u nullglob
fi

if (( ${#requested[@]} == 0 )); then
    echo "No set folders with a set.json found in $STL_ROOT" >&2
    exit 1
fi

built=0
skipped=0

for set_id in "${requested[@]}"; do
    dir="$STL_ROOT/$set_id"
    if [[ ! -d "$dir" ]]; then
        echo "error: no such set folder: $dir" >&2
        exit 1
    fi

    paid="$(set_field "$dir" '.paid' 'false')"
    if [[ "$paid" == "true" ]]; then
        # A skip, not an error, so `jake stl` still works with paid sets
        # present — but say why, because silently omitting a set is worse.
        echo "skip  $set_id — paid set; publish to R2 with \`npx jake publish-sets\`"
        (( skipped++ )) || true
        continue
    fi

    # Refuse to package a set whose version the site disagrees about.
    require_version_agreement "$set_id" "$dir"

    version="$(set_field "$dir" '.version')"
    base_name="$(set_field "$dir" '.publicZipBaseName')"
    zip_name="${base_name}-${version}.zip"
    zip_path="$STL_ROOT/$zip_name"

    shopt -s nullglob
    contents=("$dir"/*.stl "$dir"/*.svg)
    shopt -u nullglob
    if (( ${#contents[@]} == 0 )); then
        echo "error: $set_id has no .stl/.svg files to package" >&2
        exit 1
    fi

    echo "▸ $set_id v$version → $zip_name (${#contents[@]} files)"
    rm -f "$zip_path"

    # Every entry sits under a single top-level folder named after the zip, so
    # extracting drops one tidy directory rather than 26 loose STLs into
    # someone's Downloads. That is the structure previously published zips had
    # (back when the source folder itself carried the version), and existing
    # links still point at this filename — so it has to stay that way.
    #
    # Staged through a temp directory because the source folder is now named
    # base-set/, not the versioned name the archive needs. Only model files are
    # copied in: set.json is repo bookkeeping and has no business in a
    # customer's download.
    staging="$(mktemp -d)"
    trap 'rm -rf "$staging"' EXIT
    mkdir "$staging/${base_name}-${version}"
    cp "${contents[@]}" "$staging/${base_name}-${version}/"
    ( cd "$staging" && zip -qrX "$zip_path" "${base_name}-${version}" )
    rm -rf "$staging"
    trap - EXIT

    echo "  $(du -h "$zip_path" | cut -f1)  $zip_path"
    (( built++ )) || true
done

echo
echo "Done: $built zip(s) built, $skipped skipped."
