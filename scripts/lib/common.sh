#!/usr/bin/env bash
# Shared helpers for every build script under scripts/.
#
# Source it, don't run it:
#   source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"
#
# Everything the build scripts used to repeat verbatim lives here: repo-root
# resolution, the canonical output directories, the Typst invocation (which
# always needs --root and --font-path, see rulebook/typst/CLAUDE.md), the
# Ghostscript re-distill, and the pdfinfo page count. Scripts stay short
# enough to read top-to-bottom; this file is the only place a path or a
# Typst flag has to be corrected.

set -euo pipefail

# Repo root, resolved from this file's own location (scripts/lib/) so it is
# correct no matter which directory a script was invoked from.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Typst binary. The vendored fonts make the build hermetic, but the binary
# itself is not vendored — override with e.g. TYPST=~/.local/bin/typst.
TYPST="${TYPST:-typst}"

# Typst sources stay next to their assets and fonts; only the shell wrappers
# live under scripts/.
TYPST_DIR="$REPO_ROOT/rulebook/typst"
FONT_DIR="$TYPST_DIR/fonts"

# STL sources. The base set's folder name has changed over time (it used to
# carry the release version, cannons-and-coastlines-base-set-0.3/), so resolve
# it once here rather than hard-coding a version in five scripts: prefer the
# newest versioned folder when one exists, otherwise the unversioned
# base-set/. Override with BASE_SET_DIR=... for a one-off render.
# Free sets live here. Everything under assets/ is SERVED PUBLICLY: the Nuxt
# site symlinks nuxt-site/public/assets -> ../../assets, so anything in this
# tree is downloadable by anyone the moment the site deploys.
STL_ROOT="$REPO_ROOT/assets/stls"

# Paid sets live OUTSIDE the published tree, for exactly that reason. Keeping
# them out of git is not enough on its own — .gitignore governs what is
# committed, not what is served — so the staging area sits where no symlink
# reaches it. Do not move these back under assets/.
PAID_SET_ROOT="$REPO_ROOT/paid-sets"
if [[ -z "${BASE_SET_DIR:-}" ]]; then
    shopt -s nullglob
    _versioned=("$STL_ROOT"/cannons-and-coastlines-base-set-*/)
    shopt -u nullglob
    if (( ${#_versioned[@]} )); then
        BASE_SET_DIR="${_versioned[-1]%/}"
    else
        BASE_SET_DIR="$STL_ROOT/base-set"
    fi
    unset _versioned
fi

# Canonical output paths. The site and README link straight at these — see
# rulebook/typst/CLAUDE.md, don't move them.
PDF_DIR="$REPO_ROOT/rulebook/pdf"
PNG_DIR="$REPO_ROOT/rulebook/png"
SVG_DIR="$REPO_ROOT/rulebook/svg"

# typst_compile <source.typ> <output> [extra typst args...]
#
# <source.typ> may be a bare filename (resolved against rulebook/typst/) or a
# path. --root is required because the .typ files read ../../rulebook/assets/*
# from outside their own directory; --font-path pins the vendored faces.
typst_compile() {
    local src="$1" out="$2"
    shift 2
    [[ "$src" == /* ]] || src="$TYPST_DIR/$src"
    mkdir -p "$(dirname "$out")"
    "$TYPST" compile \
        --root "$REPO_ROOT" \
        --font-path "$FONT_DIR" \
        "$@" \
        "$src" \
        "$out"
}

# pypdf_python <script.py> [args...]
#
# Run a Python script that imports pypdf (the imposition scripts). Uses the
# system python3 when it already has pypdf; otherwise falls back to uv, which
# supplies pypdf in a throwaway environment without touching the system.
pypdf_python() {
    if python3 -c 'import pypdf' >/dev/null 2>&1; then
        python3 "$@"
    elif command -v uv >/dev/null 2>&1; then
        uv run --quiet --no-project --with pypdf python3 "$@"
    else
        echo "error: pypdf is not installed and uv is not available." >&2
        echo "       Install one: 'pip install pypdf' or https://docs.astral.sh/uv/" >&2
        return 1
    fi
}

# pdf_pages <pdf> — page count, or empty if pdfinfo is unavailable/failed.
pdf_pages() {
    pdfinfo "$1" 2>/dev/null | awk '/^Pages:/ {print $2}'
}

# compress_pdf [--profile <printer|prepress|ebook|screen>] <input.pdf> [output.pdf]
#
# Re-distill a PDF through Ghostscript to shrink embedded raster assets.
# Typst emits PDFs with full-resolution PNGs/JPEGs inline, which produces
# large files; Ghostscript /printer or /prepress shrinks them substantially
# while keeping print-grade quality.
#
# Profiles (Ghostscript -dPDFSETTINGS):
#   /printer  — 300 dpi, good print quality, smaller file (web-friendly, default).
#   /prepress — 300 dpi, color-preserving, preferred for print houses.
#   /ebook    — 150 dpi, screen reading.
#   /screen   — 72 dpi, smallest.
#
# With no output path the input is replaced in place, but only if the result
# is actually smaller. With an explicit output path the file is always
# written. No-op if ghostscript is missing.
compress_pdf() {
    local profile="/printer"
    if [[ "${1:-}" == "--profile" ]]; then
        profile="/$2"
        shift 2
    fi

    local pdf="$1" out="${2:-}" in_place=0
    if [[ -z "$out" ]]; then
        out="${pdf%.pdf}.compressed.pdf"
        in_place=1
    fi

    if ! command -v gs >/dev/null 2>&1; then
        echo "  (gs not found; skipping compression of $(basename "$pdf"))" >&2
        return 0
    fi

    gs -sDEVICE=pdfwrite -dPDFSETTINGS="$profile" \
       -dNOPAUSE -dQUIET -dBATCH \
       -sOutputFile="$out" "$pdf"

    local before after
    before=$(stat -c%s "$pdf")
    after=$(stat -c%s "$out")

    if (( in_place )); then
        if (( after < before )); then
            mv "$out" "$pdf"
            printf "  compressed %s (%s): %s → %s\n" \
                "$(basename "$pdf")" "$profile" \
                "$(numfmt --to=iec --suffix=B "$before")" \
                "$(numfmt --to=iec --suffix=B "$after")"
        else
            rm -f "$out"
            printf "  %s already optimal (%s)\n" \
                "$(basename "$pdf")" \
                "$(numfmt --to=iec --suffix=B "$before")"
        fi
    else
        printf "  wrote %s (%s): %s → %s\n" \
            "$(basename "$out")" "$profile" \
            "$(numfmt --to=iec --suffix=B "$before")" \
            "$(numfmt --to=iec --suffix=B "$after")"
    fi
}

# ── STL set metadata ──────────────────────────────────────────────────
#
# Each folder under assets/stls/ carries a set.json holding its version of
# record (the folder name no longer does). Two files must agree about a
# version: that set.json, and the matching entry in the site manifest
# nuxt-site/server/data/sets.json, which the Worker bundles to build R2 keys.
# The helpers below read the first and check it against the second, so a
# forgotten bump fails the build instead of shipping a wrong URL.

SETS_MANIFEST="$REPO_ROOT/nuxt-site/server/data/sets.json"

# set_field <set-dir> <jq-filter> [default]
# Reads one field out of a set folder's set.json.
set_field() {
    local dir="$1" filter="$2" default="${3-}"
    local file="$dir/set.json"
    if [[ ! -f "$file" ]]; then
        if [[ -n "$default" ]]; then echo "$default"; return 0; fi
        echo "error: $file is missing — every set folder needs one" >&2
        return 1
    fi
    local value
    value="$(jq -r "$filter // empty" "$file")"
    if [[ -z "$value" ]]; then
        if [[ -n "$default" ]]; then echo "$default"; return 0; fi
        echo "error: $file has no $filter" >&2
        return 1
    fi
    printf '%s\n' "$value"
}

# manifest_version <set-id>
# The version the site manifest believes a set is on. Empty if absent.
manifest_version() {
    jq -r --arg id "$1" '.sets[] | select(.id == $id) | .version // empty' "$SETS_MANIFEST"
}

# require_version_agreement <set-id> <set-dir>
# Fails loudly when set.json and the site manifest disagree. Called before
# anything is packaged, so a mismatch never reaches a zip or an R2 key.
require_version_agreement() {
    local id="$1" dir="$2" local_v manifest_v
    local_v="$(set_field "$dir" '.version')" || return 1
    manifest_v="$(manifest_version "$id")"

    if [[ -z "$manifest_v" ]]; then
        echo "error: '$id' has no entry in nuxt-site/server/data/sets.json" >&2
        return 1
    fi
    if [[ "$local_v" != "$manifest_v" ]]; then
        cat >&2 <<MSG
error: version mismatch for '$id'
    $dir/set.json          says $local_v
    nuxt-site/server/data/sets.json  says $manifest_v
  set.json is the source of truth. Run \`npx jake sets-sync\` to copy it
  across, then re-run this build.
MSG
        return 1
    fi
}

# set_dir <set-id>
# Where a set's files are, whichever root holds it. Paid sets are under
# paid-sets/, free sets under assets/stls/.
set_dir() {
    local id="$1"
    if [[ -d "$PAID_SET_ROOT/$id" ]]; then
        echo "$PAID_SET_ROOT/$id"
    elif [[ -d "$STL_ROOT/$id" ]]; then
        echo "$STL_ROOT/$id"
    else
        echo "error: no folder for set '$id' in $PAID_SET_ROOT or $STL_ROOT" >&2
        return 1
    fi
}

# all_set_dirs
# Every set folder in either root, one path per line.
all_set_dirs() {
    shopt -s nullglob
    local d
    for d in "$STL_ROOT"/*/ "$PAID_SET_ROOT"/*/; do
        [[ -f "${d}set.json" ]] && echo "${d%/}"
    done
    shopt -u nullglob
}

# preview_ship_stem <set-dir>
#
# Which hull represents a set in its card art. A set with exactly one
# ship-*.stl answers itself; one with several needs "previewShip" in its
# set.json, because picking the hull that represents a fleet is a judgement
# call and guessing it wrong is a silent, visible mistake.
preview_ship_stem() {
    local dir="$1" chosen

    chosen="$(jq -r '.previewShip // empty' "$dir/set.json" 2>/dev/null || true)"
    if [[ -n "$chosen" ]]; then
        if [[ ! -f "$dir/$chosen" ]]; then
            echo "error: set.json names previewShip '$chosen' but $dir/$chosen does not exist" >&2
            return 1
        fi
        basename "$chosen" .stl
        return 0
    fi

    shopt -s nullglob
    local ships=("$dir"/ship-*.stl)
    shopt -u nullglob

    case ${#ships[@]} in
        0)
            echo "error: no ship-*.stl in $dir" >&2
            return 1 ;;
        1)
            basename "${ships[0]}" .stl ;;
        *)
            {
                echo "error: $dir has ${#ships[@]} ship models; set \"previewShip\" in its set.json to pick one:"
                printf '           %s\n' "${ships[@]##*/}"
            } >&2
            return 1 ;;
    esac
}
