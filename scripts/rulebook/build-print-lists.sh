#!/usr/bin/env bash
# Build the print list PDFs the site links: rulebook/pdf/print-list-<id>.pdf
# for every set and bundle in nuxt-site/server/data/sets.json.
#
#   npx jake print-lists
#   scripts/rulebook/build-print-lists.sh base-set industry-set
#
# The zips carry the same PDF as PRINTING.pdf. scripts/build-stl-zip.sh and
# scripts/build-paid-zips.sh build it with print_list_pdf (scripts/lib/common.sh)
# instead of copying these, so a zip never ships a stale one.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

command -v jq >/dev/null 2>&1 || { echo "error: jq is required but not installed" >&2; exit 1; }

if (( $# )); then
    ids=("$@")
else
    mapfile -t ids < <(jq -r '.sets[].id, (.bundles[]?.id)' "$SETS_MANIFEST")
fi

mkdir -p "$PDF_DIR"
for id in "${ids[@]}"; do
    out="$PDF_DIR/print-list-$id.pdf"
    print_list_pdf "$id" "$out"
    echo "▸ $id  $(pdf_pages "$out") pages  $(du -h "$out" | cut -f1)  ${out#"$REPO_ROOT"/}"
done
