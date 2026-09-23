#!/usr/bin/env bash
# Build the shop's 3D preview meshes from nuxt-site/shared/data/ship-assemblies.json.
#
#   npx jake preview-meshes                 # every mesh the JSON names
#   ./build_preview_meshes.sh sail cannon   # just these parts/ships (JSON keys)
#
# Paid STLs are gitignored, so a machine without paid-sets/ rebuilds only the
# free meshes and leaves the committed paid previews alone.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v blender >/dev/null 2>&1 || { echo "error: blender is not on PATH" >&2; exit 1; }
blender --background --python "$HERE/build_preview_meshes.py" -- "$@" 2>&1 | grep -E '^(built|skip)|Error|Traceback'
