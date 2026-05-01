#!/usr/bin/env bash
# Generates the parchment-overlay PNGs that sit on top of each faction banner
# in the card. The overlay carries the *real* parchment texture in its opaque
# regions, so the banner art dissolves into the body parchment without a
# flat-colored seam.
#
# Outputs (under rulebook/assets/):
#   banner-parchment-fade.png          — matches today's fade shape (bottom +
#                                        side gutters, top fully transparent)
#   banner-parchment-fade-vignette.png — radial / four-edge vignette variant
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ASSETS="$ROOT_DIR/rulebook/assets"
SRC="$ASSETS/parchment-bg.jpg"

# Banner is 6.25in × 2.48in. Render the overlay at ~300dpi and round to even
# pixels for clean resampling.
W=1920
H=762

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. Tile parchment.jpg out to banner dimensions. Source is 1024×1024; resize
#    to cover, then center-crop.
#
#    Then mute it with a 70% cream wash to match the body parchment, which is
#    rendered as: cream base → parchment.jpg (opaque) → 70% cream rect on top.
#    Without this, the overlay's opaque regions look darker/more textured than
#    the body and the banner→body seam is visible.
magick "$SRC" \
  -resize "${W}x${H}^" \
  -gravity center -extent "${W}x${H}" \
  -fill "rgb(247,238,217)" -colorize 71 \
  "$TMP/parchment.png"

# 2a. "Edges" mask — replicates the existing Typst gradient stops:
#     vertical: 0 (top→50%), 100 (72%), 220 (90%), 255 (bottom)
#     horizontal: 230 at left/right edges, fading to 0 by 12%/88%
magick -size "${W}x${H}" xc:black \
  -fx "
    yy = j/h;
    xx = i/w;
    vmask = yy<0.50 ? 0 :
            yy<0.72 ? (yy-0.50)/0.22 * (100/255) :
            yy<0.90 ? 100/255 + (yy-0.72)/0.18 * (155/255) :
                      1;
    hmask = xx<0.12 ? 1 - xx/0.12 :
            xx>0.88 ? (xx-0.88)/0.12 :
                      0;
    max(vmask, hmask)
  " \
  "$TMP/mask-edges.png"

# 2b. Vignette mask — opaque at all four edges, transparent in the middle,
#     with a smooth power-curve falloff so the banner art reads cleanly.
magick -size "${W}x${H}" xc: \
  -fx "
    dxleft  = i/w;
    dxright = 1 - i/w;
    dytop   = j/h;
    dybot   = 1 - j/h;
    atop   = dytop<0.10   ? 1 : dytop<0.50   ? (1-(dytop-0.10)/0.40)^1.6   : 0;
    abot   = dybot<0.015  ? 1 : dybot<0.58   ? (1-(dybot-0.015)/0.565)^1.6 : 0;
    aleft  = dxleft<0.05  ? 1 : dxleft<0.20  ? (1-(dxleft-0.05)/0.15)^1.6  : 0;
    aright = dxright<0.05 ? 1 : dxright<0.20 ? (1-(dxright-0.05)/0.15)^1.6 : 0;
    max(max(atop, abot), max(aleft, aright))
  " \
  "$TMP/mask-vignette.png"

# 3. Apply each mask as the alpha channel of the parchment tile.
for variant in edges vignette; do
  if [[ "$variant" == vignette ]]; then
    out="$ASSETS/banner-parchment-fade-vignette.png"
  else
    out="$ASSETS/banner-parchment-fade.png"
  fi
  magick "$TMP/parchment.png" "$TMP/mask-$variant.png" \
    -alpha off -compose CopyOpacity -composite \
    "$out"
  echo "Wrote $out"
done
