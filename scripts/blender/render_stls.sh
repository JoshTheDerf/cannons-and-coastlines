#!/usr/bin/env bash
# Convenience wrapper around render_stls.py.
#
# Usage:
#   ./render_stls.sh [<input_dir>] [<output_dir>] [extra args passed through]
#
# Defaults render the base set into assets/images/renders/ so the PNGs
# ship with the site (and are picked up by the Typst rulebook build).
#
# Each STL is rendered in its own Blender process. The Cycles render path
# leaks resources across renders within the same process (each iteration
# gets slower, eventually OOMs), so per-file invocation is the only way to
# keep batch render time stable.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

INPUT="${1:-$REPO/assets/stls/cannons-and-coastlines-base-set-0.3}"
OUTPUT="${2:-$REPO/assets/images/renders}"
shift $(( $# > 2 ? 2 : $# ))

mkdir -p "$OUTPUT"

shopt -s nullglob
stls=("$INPUT"/*.stl)
shopt -u nullglob

if (( ${#stls[@]} == 0 )); then
    echo "No STLs found in $INPUT" >&2
    exit 1
fi

echo "Rendering ${#stls[@]} STL(s) from $INPUT -> $OUTPUT"
for stl in "${stls[@]}"; do
    name=$(basename "$stl")
    echo "==> $name"
    blender --background --python "$HERE/render_stls.py" -- \
        "$INPUT" "$OUTPUT" --only "$name" "$@"
done

echo "All renders complete."
