#!/usr/bin/env bash
# Build the public STL zip for every FREE set under assets/stls/.
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
#     -> assets/stls/cannons-and-coastlines-base-set.zip
#        (everything inside a cannons-and-coastlines-base-set-0.3/ folder)
#
# The zip's own filename never changes, so its download URL is permanent and
# a release is just a new file at the same address (served with a short
# cache; see _headers). The version lives in the folder inside, so anyone can
# tell which one they have.
#
# This builds a zip at whatever version set.json currently names; it is not
# how you cut a release. Use `npx jake "bump-set[<set-id>,<version>]"`, which
# calls this script and also syncs the site manifest.
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

# make_zip <output.zip> <directory>
#
# Archives <directory> (relative to the cwd) into <output.zip>. Prefers Info-ZIP
# and falls back to python3's zipfile, which is not a nicety: python3 is already
# a hard dependency of this repo's build (the booklet and card-sheet imposition
# scripts are python3), while `zip` is not installed by default on every distro.
# Losing the release build to a missing archiver is a worse failure than
# carrying ten lines of fallback.
#
# Both paths produce the same shape -- one top-level folder, deflate-compressed,
# entries sorted so repeated builds of unchanged input match byte for byte.
make_zip() {
    local out="$1" dir="$2"
    if command -v zip >/dev/null 2>&1; then
        # -X drops platform extras (uid/gid, resource forks) that vary by machine.
        zip -qrX "$out" "$dir"
        return
    fi
    python3 - "$out" "$dir" <<'PY'
import os, sys, zipfile

out, top = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(top):
        dirs.sort()
        for name in sorted(files):
            path = os.path.join(root, name)
            z.write(path, path)
PY
}

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
    zip_name="${base_name}.zip"
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

    # Every entry sits under a single top-level folder carrying the version,
    # so extracting drops one tidy directory rather than 26 loose STLs into
    # someone's Downloads, and says which release it is.
    #
    # Staged through a temp directory because the source folder is now named
    # base-set/, not the versioned name the archive needs. Only model files are
    # copied in: set.json is repo bookkeeping and has no business in a
    # customer's download.
    staging="$(mktemp -d)"
    trap 'rm -rf "$staging"' EXIT
    mkdir "$staging/${base_name}-${version}"
    cp "${contents[@]}" "$staging/${base_name}-${version}/"
    ( cd "$staging" && make_zip "$zip_path" "${base_name}-${version}" )
    rm -rf "$staging"
    trap - EXIT

    echo "  $(du -h "$zip_path" | cut -f1)  $zip_path"
    (( built++ )) || true
done

echo
echo "Done: $built zip(s) built, $skipped skipped."
