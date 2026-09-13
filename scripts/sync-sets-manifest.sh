#!/usr/bin/env bash
# Copy each set's version from its set.json into the site manifest.
#
#   npx jake sets-sync         # apply
#   CHECK=1 npx jake sets-sync # report drift, change nothing, exit 1 if any
#
# Two files have to agree about a version and they cannot be merged into one:
#
#   assets/stls/<set>/set.json          source of truth, lives with the STLs,
#                                       read by the build scripts
#   nuxt-site/server/data/sets.json     bundled into the Worker at build time
#                                       (Workers have no filesystem) and used
#                                       to build R2 keys at request time
#
# So set.json is authoritative and this script pushes its value across. The
# build scripts refuse to package anything while the two disagree, which is
# what stops a forgotten bump from producing a download URL for a version that
# was never uploaded.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required but not installed" >&2; exit 1; }

CHECK="${CHECK:-}"
drift=0
changed=0

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cp "$SETS_MANIFEST" "$tmp"

while read -r dir; do
    set_id="$(basename "$dir")"

    local_v="$(set_field "$dir" '.version')"
    manifest_v="$(manifest_version "$set_id")"

    if [[ -z "$manifest_v" ]]; then
        # A set on disk that the site has never heard of. Not something this
        # script should invent an entry for: the manifest also needs a title,
        # images and a price, which only a human can supply.
        echo "warn  $set_id — on disk but missing from $(basename "$SETS_MANIFEST"); add an entry by hand" >&2
        drift=1
        continue
    fi

    if [[ "$local_v" == "$manifest_v" ]]; then
        echo "ok    $set_id  v$local_v"
        continue
    fi

    drift=1
    if [[ -n "$CHECK" ]]; then
        echo "DRIFT $set_id  set.json v$local_v  ≠  manifest v$manifest_v"
    else
        echo "sync  $set_id  v$manifest_v → v$local_v"
        # freeDownloadUrl carries the version in its filename, so syncing the
        # version alone leaves the manifest pointing at the previous zip -- a
        # dead link the moment the old file is retired. Rewrite it from the
        # same source of truth, but only for a free set that already has one:
        # paid sets hold null here and resolve through R2 instead.
        jq --arg id "$set_id" --arg v "$local_v" '
             (.sets[] | select(.id == $id) | .version) = $v
           | (.sets[] | select(.id == $id and (.freeDownloadUrl // "") != "")
               | .freeDownloadUrl) |= sub("-[^-/]+\\.zip$"; "-" + $v + ".zip")
           ' "$tmp" > "$tmp.next"
        mv "$tmp.next" "$tmp"
        (( changed++ )) || true
    fi
done < <(all_set_dirs)

# A set in the manifest with no folder on disk: the reverse drift, worth
# flagging because its download route would 404 against R2.
while read -r orphan; do
    [[ -z "$orphan" ]] && continue
    if [[ ! -d "$STL_ROOT/$orphan" && ! -d "$PAID_SET_ROOT/$orphan" ]]; then
        echo "warn  $orphan — in the manifest but has no folder in either set root" >&2
        drift=1
    fi
done < <(jq -r '.sets[].id' "$SETS_MANIFEST")

echo
if [[ -n "$CHECK" ]]; then
    if (( drift )); then
        echo "Manifests disagree. Run \`npx jake sets-sync\` to fix." >&2
        exit 1
    fi
    echo "Manifests agree."
    exit 0
fi

if (( changed )); then
    cp "$tmp" "$SETS_MANIFEST"
    echo "Updated $changed version(s) in ${SETS_MANIFEST#"$REPO_ROOT"/}"
else
    echo "Nothing to sync."
fi
