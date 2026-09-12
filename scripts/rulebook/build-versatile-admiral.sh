#!/usr/bin/env bash
# Build "The Versatile Admiral" addon rulebook (PDF + per-page PNGs).
# Same shape as build-rulebook.sh, minus the SVG pass: its booklet
# imposition works from the PDF, so no per-page SVGs are needed.
set -euo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")/../lib" && pwd)/common.sh"

mkdir -p "$PDF_DIR" "$PNG_DIR"

# Drop stale per-page PNGs so a shrinking page count leaves no orphans.
rm -f "$PNG_DIR"/versatile-admiral-*.png

echo "Building Versatile Admiral PDF..."
typst_compile versatile-admiral.typ "$PDF_DIR/versatile-admiral.pdf"

echo "Compressing Versatile Admiral PDF for web..."
compress_pdf "$PDF_DIR/versatile-admiral.pdf"

echo "Building Versatile Admiral PNGs (300dpi, one per page)..."
typst_compile versatile-admiral.typ "$PNG_DIR/versatile-admiral-{p}.png" \
  --format png --ppi 300

echo "Done. $(pdf_pages "$PDF_DIR/versatile-admiral.pdf") pages. PDF in $PDF_DIR, PNGs in $PNG_DIR."
