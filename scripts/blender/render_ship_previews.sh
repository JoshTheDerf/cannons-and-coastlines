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
# assets/ships/renders/ as <stem>-preview.png.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

INPUT="${1:-$REPO/assets/stls/cannons-and-coastlines-base-set-0.3}"
OUTPUT="${2:-$REPO/assets/ships/renders}"
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
        --elevation 18 --azimuth -60 --rotate-z 90 \
        --res 1408 --aspect 1408:768 \
        --samples 96 --margin 0.96 --no-top \
        "$@"
done

# Strip the iso-pass `-top` siblings that render_stls.py would normally make
# for coin items; not relevant here but keeps the output dir clean if a non-ship
# pattern was passed through.
echo "Ship previews complete."
