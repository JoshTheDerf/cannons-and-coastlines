#!/usr/bin/env bash
# Build versioned STL zip(s) from each cannons-and-coastlines-base-set-* folder
# under assets/stls/. The zip is named after the folder so the version is
# derived from the directory name (e.g. .../base-set-0.3/ -> base-set-0.3.zip).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STL_DIR="$ROOT_DIR/assets/stls"

shopt -s nullglob
folders=("$STL_DIR"/cannons-and-coastlines-base-set-*/)
if [ ${#folders[@]} -eq 0 ]; then
    echo "No cannons-and-coastlines-base-set-* folders found in $STL_DIR" >&2
    exit 1
fi

for folder in "${folders[@]}"; do
    name="$(basename "$folder")"
    zip_path="$STL_DIR/$name.zip"
    echo "Zipping $name -> $(basename "$zip_path")"
    rm -f "$zip_path"
    (cd "$STL_DIR" && python3 -m zipfile -c "$name.zip" "$name")
    size=$(du -h "$zip_path" | cut -f1)
    echo "  $zip_path ($size)"
done
