#!/usr/bin/env bash
# Saddle-stitch booklet imposition of The Versatile Admiral.
# Mirrors build-booklet.sh; see that script for why imposition works from
# the source PDF rather than from per-page SVGs.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/../lib/common.sh"

mkdir -p "$PDF_DIR"

if [[ ! -f "$PDF_DIR/versatile-admiral.pdf" ]]; then
  echo "versatile-admiral.pdf not found; running build-versatile-admiral.sh first..."
  "$HERE/build-versatile-admiral.sh"
fi

PAGES=$(pdf_pages "$PDF_DIR/versatile-admiral.pdf")
if [[ -z "${PAGES:-}" ]]; then
  echo "Could not determine page count; aborting." >&2
  exit 1
fi

echo "Imposing $PAGES-page Versatile Admiral as booklet signatures..."
python3 "$HERE/impose-booklet.py" \
  "$PDF_DIR/versatile-admiral.pdf" \
  "$PDF_DIR/versatile-admiral-booklet.pdf"

echo "Compressing booklet PDF for web..."
compress_pdf "$PDF_DIR/versatile-admiral-booklet.pdf"

SHEETS=$(pdf_pages "$PDF_DIR/versatile-admiral-booklet.pdf")
echo "Done. $SHEETS imposed sheet-sides ($((SHEETS / 2)) physical sheets, double-sided)."
echo "PDF: $PDF_DIR/versatile-admiral-booklet.pdf"
