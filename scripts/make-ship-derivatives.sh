#!/usr/bin/env bash
# Turn a ship render into the images the site actually links at.
#
#   scripts/make-ship-derivatives.sh <set-id> [<render.png>]
#
# The Blender pass writes assets/ships/renders/<stl-stem>.png. The site asks
# for different names at different sizes, and the stems do not line up with
# the STL names (ship-islander.stl backs a faction the site calls
# "islanders"). Rather than invent a second naming convention, the output
# paths are read from the set's entry in nuxt-site/server/data/sets.json:
#
#   images.large   <- the full-size render, 1408x768
#   images.preview <- the card thumbnail, 720x393 webp
#
# So renaming an image on the site is a manifest edit, and this script follows.
#
# EXTRA THUMBNAILS. The manifest has one image pair per set, because a set is
# what the shop sells. The home page is organised by faction instead, and
# base-set fields two of them, so its second hull would have no way to be
# rebuilt. A set folder may therefore declare extras in its set.json:
#
#   "extraPreviews": { "ship-corsair": "/assets/ships/ship-preview-corsairs-sm.webp" }
#
# keyed by STL stem, valued by the site path to write. They get the thumbnail
# treatment only — nothing links a large version of them.
#
# Renders carry an alpha channel and every output keeps it: the faction cards
# put these on a dark panel, so a baked-in background would show as a pale box.
#
# This step needs only ImageMagick, so it runs anywhere — unlike the Blender
# pass it usually follows.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/lib" && pwd)/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }
MAGICK="$(command -v magick || command -v convert || true)"
[[ -n "$MAGICK" ]] || { echo "error: ImageMagick (magick/convert) is required" >&2; exit 1; }

# Dimensions the site's layout is built around; see the existing art.
LARGE_W=1408
LARGE_H=768
PREVIEW_W=720
PREVIEW_H=393

# derive <render.png> <out-path> <width> <height> [extra magick args...]
#
# Fits the render inside the target canvas and centres it there. Resize alone
# would hand back whatever aspect the render happened to have; the -extent
# pads it to the exact size the site's layout expects instead of stretching
# the ship. -background none keeps the padding transparent.
derive() {
    local render="$1" out="$2" w="$3" h="$4"
    shift 4
    mkdir -p "$(dirname "$out")"
    "$MAGICK" "$render" \
        -resize "${w}x${h}" \
        -background none -gravity center -extent "${w}x${h}" \
        "$@" \
        "$out"
}

# report <label> <site-path>
report() {
    printf '  %-9s %s  (%s)\n' "$1:" "$2" "$(du -h "$REPO_ROOT/${2#/}" | cut -f1)"
}

set_id="${1:-}"
[[ -n "$set_id" ]] || { echo "usage: $(basename "$0") <set-id> [<render.png>]" >&2; exit 1; }

entry="$(jq -c --arg id "$set_id" '.sets[] | select(.id == $id)' "$SETS_MANIFEST")"
[[ -n "$entry" ]] || { echo "error: '$set_id' is not in $(basename "$SETS_MANIFEST")" >&2; exit 1; }

large_rel="$(jq -r '.images.large'   <<<"$entry")"
preview_rel="$(jq -r '.images.preview' <<<"$entry")"
src_dir="$REPO_ROOT/$(jq -r '.sourceDir' <<<"$entry")"
RENDER_DIR="$REPO_ROOT/assets/ships/renders"

# Source render: given explicitly, or inferred from the set's preview ship.
if [[ -n "${2:-}" ]]; then
    render="$2"
else
    stem="$(preview_ship_stem "$src_dir")" || exit 1
    render="$RENDER_DIR/${stem}.png"
fi

require_render() {
    [[ -f "$1" ]] && return 0
    cat >&2 <<MSG
error: no render at ${1#"$REPO_ROOT"/}
  Render it first (needs Blender):
      npx jake set-previews[$set_id]
MSG
    return 1
}

require_render "$render" || exit 1

echo "▸ $set_id"
echo "  source:   ${render#"$REPO_ROOT"/}"

# A set may point images.large straight at the render itself (base-set does).
# Deriving would then read and rewrite the same file, re-encoding the
# canonical render a little worse on every run, so leave it alone instead.
large_path="$REPO_ROOT/${large_rel#/}"
if [[ "$(readlink -f "$large_path" 2>/dev/null)" == "$(readlink -f "$render")" ]]; then
    echo "  large:    ${large_rel}  (is the render itself; left as-is)"
else
    derive "$render" "$large_path" "$LARGE_W" "$LARGE_H"
    report large "$large_rel"
fi

# -strip drops metadata, quality 82 is where these renders stop gaining
# visible detail.
derive "$render" "$REPO_ROOT/${preview_rel#/}" "$PREVIEW_W" "$PREVIEW_H" -strip -quality 82
report preview "$preview_rel"

# Extra per-hull thumbnails, if this set declares any.
while IFS=$'\t' read -r extra_stem extra_rel; do
    [[ -n "$extra_stem" ]] || continue
    extra_render="$RENDER_DIR/${extra_stem}.png"
    require_render "$extra_render" || exit 1
    derive "$extra_render" "$REPO_ROOT/${extra_rel#/}" "$PREVIEW_W" "$PREVIEW_H" -strip -quality 82
    report "$extra_stem" "$extra_rel"
done < <(jq -r '(.extraPreviews // {}) | to_entries[] | "\(.key)\t\(.value)"' "$src_dir/set.json")
