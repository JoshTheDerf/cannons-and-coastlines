#!/usr/bin/env bash
# Render ship hulls as low-angle 3/4 product shots for the website's faction
# cards. Matches the framing of the original AI-generated previews
# (1408x768, low elevation, perspective lens) so the rendered output can be a
# drop-in replacement.
#
# Usage:
#   ./render_ship_previews.sh [<input_dir>] [<output_dir>] [extra args]
#
# Defaults render every ship-*.stl from the base set into
# assets/ships/renders/ as <stem>.png. Those renders are the canonical
# faction preview art for the site; scripts/make-ship-derivatives.sh turns
# one into the two images a set's manifest entry links at.
#
# Camera framing is fixed here because it is what makes the previews a set:
# every hull is shot on the same lens, elevation and canvas. Per-hull
# settings -- filament colour and the Z rotation that aims the bow -- are
# NOT set here; they come from cc_config.ITEM_OVERRIDES, so a new hull is
# added in one place. Pass --rotate-z explicitly only to preview an
# alternative framing for a hull before writing it into cc_config.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

INPUT="${1:-$BASE_SET_DIR}"
OUTPUT="${2:-$REPO_ROOT/assets/ships/renders}"
shift $(( $# > 2 ? 2 : $# ))

mkdir -p "$OUTPUT"

shopt -s nullglob
stls=("$INPUT"/ship-*.stl)
shopt -u nullglob

if (( ${#stls[@]} == 0 )); then
    echo "No ship-*.stl files found in $INPUT" >&2
    exit 1
fi

echo "Rendering ${#stls[@]} ship hull preview(s) from $INPUT -> $OUTPUT"
for stl in "${stls[@]}"; do
    name=$(basename "$stl")
    echo "==> $name"
    blender --background --python "$HERE/render_stls.py" -- \
        "$INPUT" "$OUTPUT" --only "$name" \
        --projection persp --lens 85 \
        --elevation 18 --azimuth -60 \
        --res 1408 --aspect 1408:768 \
        --samples 96 --margin 0.96 --no-top \
        "$@"
done

# --no-top above suppresses the top-down iso pass render_stls.py emits for
# coin items; ship previews only need the 3/4 view.
echo "Ship previews complete."
