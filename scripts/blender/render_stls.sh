#!/usr/bin/env bash
# Low-level convenience wrapper around render_stls.py: render one directory
# of STLs with whatever settings you pass.
#
# Usage:
#   ./render_stls.sh [<input_dir>] [<output_dir>] [extra args passed through]
#
# For the committed parts gallery use render_parts.sh (`npx jake renders`)
# rather than this: it pins the resolution and sample count those files were
# built at and gathers hulls from every set. This script is for one-off and
# exploratory renders, where leaving the settings to the caller is the point.
#
# Each STL is rendered in its own Blender process. The Cycles render path
# leaks resources across renders within the same process (each iteration
# gets slower, eventually OOMs), so per-file invocation is the only way to
# keep batch render time stable.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

INPUT="${1:-$BASE_SET_DIR}"
OUTPUT="${2:-$REPO_ROOT/assets/images/renders}"
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
