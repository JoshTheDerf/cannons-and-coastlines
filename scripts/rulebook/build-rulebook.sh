#!/usr/bin/env bash
# Build the main rulebook: web PDF, print PDF, per-page PNGs, per-page SVGs.
#
# Source lives in rulebook/typst/rulebook.typ; outputs land in rulebook/pdf,
# rulebook/png and rulebook/svg (linked from the site and README — see
# rulebook/typst/CLAUDE.md, don't move them).
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

mkdir -p "$PDF_DIR" "$PNG_DIR" "$SVG_DIR"

# Clear stale per-page artifacts so a shrinking page count doesn't leave
# orphans behind (the old bookletic imposition would silently pick them up).
rm -f "$PNG_DIR"/rulebook-*.png "$SVG_DIR"/rulebook-*.svg

echo "Building rulebook PDF..."
typst_compile rulebook.typ "$PDF_DIR/rulebook.pdf"

echo "Building print-optimized rulebook PDF (preserved as rulebook-print.pdf)..."
compress_pdf --profile prepress "$PDF_DIR/rulebook.pdf" "$PDF_DIR/rulebook-print.pdf"

echo "Compressing rulebook PDF for web..."
compress_pdf "$PDF_DIR/rulebook.pdf"

echo "Building rulebook PNGs (300dpi, one per page)..."
typst_compile rulebook.typ "$PNG_DIR/rulebook-{p}.png" --format png --ppi 300

echo "Building rulebook SVGs (one per page, for booklet imposition)..."
typst_compile rulebook.typ "$SVG_DIR/rulebook-{p}.svg" --format svg

echo "Done. $(pdf_pages "$PDF_DIR/rulebook.pdf") pages. PDF in $PDF_DIR, PNGs in $PNG_DIR, SVGs in $SVG_DIR."
