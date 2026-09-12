#!/usr/bin/env bash
# Render a set's ship art and install it where the site expects it.
#
#   npx jake set-previews[industry-set]
#   scripts/blender/render_set_previews.sh industry-set islander-set
#   scripts/blender/render_set_previews.sh            # every set with ships
#   SKIP_DERIVATIVES=1 ...                            # render only, no resizing
#
# Two steps, because they need different tools and fail for different reasons:
#
#   1. Blender renders every ship-*.stl in the set folder into
#      assets/ships/renders/<stem>.png  (render_ship_previews.sh)
#   2. ImageMagick derives the two images the site links at, named by the
#      set's entry in the site manifest  (../make-ship-derivatives.sh)
#
# Only step 1 needs Blender. If it is not installed, step 2 still runs against
# renders already on disk, so you can adjust image sizes on any machine.
#
# Paid sets work exactly like free ones here: a render is a picture, not a
# printable model, so it belongs in the tracked assets/ships/ tree even though
# the STL it came from is deliberately kept out of git.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required" >&2; exit 1; }

if (( $# )); then
    requested=("$@")
else
    # Every set that has at least one hull to render.
    requested=()
    while read -r dir; do
        shopt -s nullglob
        ships=("$dir"/ship-*.stl)
        shopt -u nullglob
        (( ${#ships[@]} )) && requested+=("$(basename "$dir")")
    done < <(all_set_dirs)
fi

if (( ${#requested[@]} == 0 )); then
    echo "No sets with ship-*.stl files found in either set root" >&2
    exit 1
fi

have_blender=1
command -v blender >/dev/null 2>&1 || have_blender=0
if (( ! have_blender )); then
    echo "warning: blender is not on PATH — skipping the render pass." >&2
    echo "         Derivatives will be rebuilt from existing renders instead." >&2
    echo >&2
fi

rendered=0
derived=0

for set_id in "${requested[@]}"; do
    dir="$(set_dir "$set_id")" || exit 1

    # Fails with a clear message when a multi-ship set has not said which hull
    # is the face of the fleet. Checked up front so Blender is not run for
    # minutes before the naming problem surfaces.
    stem="$(preview_ship_stem "$dir")"

    echo "════ $set_id (preview hull: $stem) ════"

    if (( have_blender )); then
        "$HERE/render_ship_previews.sh" "$dir" "$REPO_ROOT/assets/ships/renders"
        (( rendered++ )) || true
    fi

    if [[ -z "${SKIP_DERIVATIVES:-}" ]]; then
        "$REPO_ROOT/scripts/make-ship-derivatives.sh" "$set_id"
        (( derived++ )) || true
    fi
    echo
done

echo "Done: $rendered set(s) rendered, $derived set(s) with derivatives rebuilt."
if (( ! have_blender )); then
    echo
    echo "Install Blender and re-run to regenerate the renders themselves." >&2
fi
