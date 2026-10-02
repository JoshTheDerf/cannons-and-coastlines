#!/usr/bin/env bash
# Build the link-preview picture for each shop page
# (assets/images/social/<handle>.jpg, 1200 × 630), the og:image Instagram,
# Facebook, iMessage and Discord show when a /shop/<handle> link is posted.
#
# Layout and words are rulebook/typst/social-card.typ; a fleet's name and
# summary come from nuxt-site/shared/data/fleets.json. Rebuild after either
# changes, and bump SOCIAL_VERSION in nuxt-site/app/composables/useProductSeo.ts
# so the platforms fetch the new picture instead of their cached one.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

OUT_DIR="$REPO_ROOT/assets/images/social"
mkdir -p "$OUT_DIR"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Every fleet's page, plus the two shop pages that aren't one fleet.
PAGES=($(jq -r '.fleets[].id' "$REPO_ROOT/nuxt-site/shared/data/fleets.json") base-set-files all-fleets)

for p in "${PAGES[@]}"; do
  echo "Building $p..."
  typst_compile social-card.typ "$tmp/$p.png" --input "product=$p" --format png --ppi 144
  # JPEG keeps each under ~200 KB; Meta and Instagram take JPEG and PNG, not WebP.
  magick "$tmp/$p.png" -strip -quality 86 -sampling-factor 4:2:0 "$OUT_DIR/$p.jpg"
done

echo "Done. Cards in $OUT_DIR."
