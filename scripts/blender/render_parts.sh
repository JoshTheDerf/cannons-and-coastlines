#!/usr/bin/env bash
# Render the parts gallery: every printable piece as a flat-lit ortho iso
# shot on a square transparent canvas.
#
#   npx jake renders                      # everything below
#   ./render_parts.sh --hulls-only        # just the ship hulls
#   ./render_parts.sh --base-only         # just the base-set pieces
#   ./render_parts.sh --only mast.stl     # one piece, e.g. after remodelling it
#   ./render_parts.sh --only 'coin-*.stl' # or a glob
#
# Output is assets/images/renders/<stem>.png, which has two consumers and so
# is the reason this pass exists separately from the ship previews:
#
#   - the rulebook and faction-card Typst sources, via
#     rulebook/typst/card.typ's `renders` constant
#   - the site's parts page, content/pages/parts.yml
#
# THIS IS NOT THE SHIP-PREVIEW PASS. Both render the same hulls, and they are
# deliberately different pictures:
#
#              parts (here)                 previews (render_ship_previews.sh)
#   camera     ortho, 55 deg elevation      perspective 85mm, 18 deg elevation
#   canvas     800x800 square               1408x768 landscape
#   reads as   a piece on the print bed     a product photo of a finished ship
#   lands on   parchment / parts page       the site's near-black faction card
#
# That last row is why --material-variant matters: a near-black hull needs a
# lift to read on the dark card and must NOT have it on parchment. This pass
# takes the plain `material`; the preview pass asks for `preview_material`.
# See cc_config.ITEM_OVERRIDES.
#
# Hulls are gathered from every set folder in both roots, so a paid set's ship
# appears in the gallery even though its STL is never served publicly -- a
# render is a picture, not a printable model.
#
# Each STL renders in its own Blender process: the Cycles path leaks across
# renders within one process, so batches get slower and eventually OOM.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

OUTPUT="$REPO_ROOT/assets/images/renders"

# Pinned, not left to render_stls.py's defaults, because these files are
# committed and the rulebook lays out against their size. Changing a number
# here re-renders the gallery; drifting defaults would do it silently.
RES=800
SAMPLES=64

do_base=1
do_hulls=1
only=""
case "${1:-}" in
    --hulls-only) do_base=0 ;;
    --base-only)  do_hulls=0 ;;
    # Re-rendering one changed part is the common case after a model edit, and
    # it has to go through this script rather than render_stls.sh so it picks
    # up the same pinned resolution, sample count and material variant as the
    # committed gallery. A filtered run still scans both set roots.
    --only)       only="${2:-}"
                  [[ -n "$only" ]] || { echo "error: --only needs a glob" >&2; exit 1; } ;;
    "")           ;;
    *) echo "usage: $(basename "$0") [--hulls-only|--base-only|--only <glob>]" >&2; exit 1 ;;
esac

command -v blender >/dev/null 2>&1 || {
    echo "error: blender is not on PATH" >&2; exit 1; }

mkdir -p "$OUTPUT"

# list_stls <dir> <pattern>
#
# Matching files that exist, one per line. Bash only pathname-expands a word
# containing glob metacharacters, so `--only mast.stl` -- a perfectly ordinary
# thing to pass -- would otherwise sail through as a literal path that may not
# exist, and nullglob cannot help because no expansion was attempted. compgen
# -G tests the filesystem either way, and yields nothing on no match.
list_stls() {
    compgen -G "$1/$2" 2>/dev/null || true
}

# render_one <input_dir> <stl-filename>
render_one() {
    local dir="$1" name="$2"
    echo "==> $name"
    blender --background --python "$HERE/render_stls.py" -- \
        "$dir" "$OUTPUT" --only "$name" \
        --res "$RES" --samples "$SAMPLES" \
        --material-variant parts
}

count=0

if (( do_base )); then
    mapfile -t base_stls < <(list_stls "$BASE_SET_DIR" "${only:-*.stl}")
    if (( ${#base_stls[@]} == 0 )) && [[ -z "$only" ]]; then
        echo "No STLs in $BASE_SET_DIR" >&2
        exit 1
    fi

    # A plain `(( ... )) && echo` would evaluate to false on an empty array,
    # which is a failing statement under `set -e`. Use an if.
    if (( ${#base_stls[@]} )); then
        echo "════ base set: ${#base_stls[@]} piece(s) ════"
    fi
    for stl in "${base_stls[@]}"; do
        render_one "$BASE_SET_DIR" "$(basename "$stl")"
        (( ++count ))
    done
fi

if (( do_hulls )); then
    # Every hull from every set, base included. The base-set hulls are already
    # covered by the loop above when it runs, so skip what we just did.
    hull_banner=0
    while read -r dir; do
        # Same reason: this is a guard, not an assertion, so write it as one.
        if (( do_base )) && [[ "$dir" == "$BASE_SET_DIR" ]]; then
            continue
        fi
        mapfile -t hulls < <(list_stls "$dir" "${only:-ship-*.stl}")
        for stl in "${hulls[@]}"; do
            if (( ! hull_banner )); then
                echo
                echo "════ ship hulls ════"
                hull_banner=1
            fi
            render_one "$dir" "$(basename "$stl")"
            (( ++count ))
        done
    done < <(all_set_dirs)
fi

echo
if (( count == 0 )); then
    echo "Nothing matched${only:+ '$only'}. Nothing rendered." >&2
    exit 1
fi
echo "Rendered $count piece(s) -> ${OUTPUT#"$REPO_ROOT"/}"
