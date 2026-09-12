#!/usr/bin/env bash
# Turn a ship render into the two images the site actually links at.
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
# Until a real render exists, those paths hold the original AI-generated art at
# exactly these dimensions, so a render drops straight in.
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

set_id="${1:-}"
[[ -n "$set_id" ]] || { echo "usage: $(basename "$0") <set-id> [<render.png>]" >&2; exit 1; }

entry="$(jq -c --arg id "$set_id" '.sets[] | select(.id == $id)' "$SETS_MANIFEST")"
[[ -n "$entry" ]] || { echo "error: '$set_id' is not in $(basename "$SETS_MANIFEST")" >&2; exit 1; }

large_rel="$(jq -r '.images.large'   <<<"$entry")"
preview_rel="$(jq -r '.images.preview' <<<"$entry")"
large_path="$REPO_ROOT/${large_rel#/}"
preview_path="$REPO_ROOT/${preview_rel#/}"

# Source render: given explicitly, or inferred from the set's preview ship.
if [[ -n "${2:-}" ]]; then
    render="$2"
else
    src_dir="$REPO_ROOT/$(jq -r '.sourceDir' <<<"$entry")"
    stem="$(preview_ship_stem "$src_dir")" || exit 1
    render="$REPO_ROOT/assets/ships/renders/${stem}.png"
fi

if [[ ! -f "$render" ]]; then
    cat >&2 <<MSG
error: no render at $render
  Render it first (needs Blender):
      npx jake set-previews[$set_id]
MSG
    exit 1
fi

echo "▸ $set_id"
echo "  source:  ${render#"$REPO_ROOT"/}"

mkdir -p "$(dirname "$large_path")" "$(dirname "$preview_path")"

# Large: exact canvas size. The render is already 1408x768, but a render made
# at another aspect is letterboxed onto the expected canvas rather than
# stretched, so the ship keeps its proportions.
"$MAGICK" "$render" \
    -resize "${LARGE_W}x${LARGE_H}" \
    -background none -gravity center -extent "${LARGE_W}x${LARGE_H}" \
    "$large_path"
echo "  large:   ${large_rel}  ($(du -h "$large_path" | cut -f1))"

# Preview: the card thumbnail. -strip drops metadata, quality 82 is where
# these renders stop gaining visible detail.
"$MAGICK" "$render" \
    -resize "${PREVIEW_W}x${PREVIEW_H}" \
    -background none -gravity center -extent "${PREVIEW_W}x${PREVIEW_H}" \
    -strip -quality 82 \
    "$preview_path"
echo "  preview: ${preview_rel}  ($(du -h "$preview_path" | cut -f1))"
